import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SdkworkAppBuildError } from '../src/errors.ts'
import { SdkworkAppBuildRunner } from '../src/index.ts'
import type { SdkworkAppBuildFrame } from '../src/types.ts'

const directories: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  // Windows: a just-killed process tree can hold its cwd briefly; retry the removal.
  await Promise.all(directories.splice(0).map(async directory => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rm(directory, { recursive: true, force: true })
        return
      } catch (error) {
        if (attempt >= 100 || (error as NodeJS.ErrnoException).code !== 'EBUSY') throw error
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  }))
})

async function harness(): Promise<SdkworkAppBuildRunner> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SdkworkAppBuildRunner)
  return ctx.get('sdkworkAppBuild') as SdkworkAppBuildRunner
}

/** Materialize a build directory whose `build` script runs the given node snippet. */
async function buildDirectory(script: string, scripts: Record<string, string> = {}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sdkwork-app-build-'))
  directories.push(directory)
  await writeFile(join(directory, 'package.json'), JSON.stringify({
    name: 'sdkwork-app-build-fixture',
    version: '0.0.0',
    scripts: { build: script, ...scripts },
  }), 'utf8')
  return directory
}

/** Drain one build's frames until the exit frame; returns everything seen. */
async function drain(
  runner: SdkworkAppBuildRunner,
  buildId: string,
  signal: AbortSignal,
): Promise<SdkworkAppBuildFrame[]> {
  const frames: SdkworkAppBuildFrame[] = []
  for await (const frame of runner.follow(buildId, signal)) {
    frames.push(frame)
    if (frame.type === 'exit') return frames
  }
  return frames
}

function errorCode(error: unknown): string {
  expect(error).toBeInstanceOf(SdkworkAppBuildError)
  return (error as SdkworkAppBuildError).code
}

/** Poll until the build record reports exited, so spawned trees are gone before cleanup. */
async function waitForExit(runner: SdkworkAppBuildRunner, buildId: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (runner.status(buildId)?.state === 'exited') return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`build ${buildId} never exited`)
}

/**
 * Poll until the leaf build process has produced the given line. Cancelling
 * before the package-manager chain fully spawns the leaf lets that leaf
 * escape the taskkill tree walk (it then holds the cwd for its whole
 * lifetime), so cancellation tests always wait for proof of the leaf first.
 */
async function waitForOutput(runner: SdkworkAppBuildRunner, buildId: string, text: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (runner.status(buildId)?.lines.some(line => line.text === text)) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`build ${buildId} never printed "${text}"`)
}

describe('SdkworkAppBuildRunner', () => {
  it('rejects relative or missing cwd with cwd-unreadable', async () => {
    const runner = await harness()
    await expect(runner.start({ cwd: 'relative/path' })).rejects.toMatchObject({ code: 'cwd-unreadable' })
    await expect(runner.start({ cwd: join(tmpdir(), 'sdkwork-app-build-missing-dir') }))
      .rejects.toMatchObject({ code: 'cwd-unreadable' })
  })

  it('rejects a directory without package.json with no-package-json', async () => {
    const runner = await harness()
    const empty = await mkdtemp(join(tmpdir(), 'sdkwork-app-build-empty-'))
    directories.push(empty)
    await expect(runner.start({ cwd: empty })).rejects.toMatchObject({ code: 'no-package-json' })
  })

  it('rejects an unknown script with script-missing and lists the available ones', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e ""', { lint: 'node -e ""' })
    const error = await runner.start({ cwd, script: 'nope' }).catch((caught: unknown) => caught)
    expect(errorCode(error)).toBe('script-missing')
    expect((error as SdkworkAppBuildError).message).toContain('lint')
  })

  it('rejects unsafe arguments before spawning', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e ""')
    await expect(runner.start({ cwd, args: ['not safe'] })).rejects.toMatchObject({ code: 'script-missing' })
  })

  it('streams started, output, and a succeeded exit for a passing build', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e "console.log(\'build-ok\')"')
    const { buildId, command } = await runner.start({ cwd })
    expect(command).toMatch(/^(npm|pnpm|yarn) run build$/)
    const frames = await drain(runner, buildId, new AbortController().signal)
    expect(frames[0]).toMatchObject({ type: 'started', buildId, cwd })
    const texts = frames
      .filter((frame): frame is Extract<SdkworkAppBuildFrame, { type: 'output' }> => frame.type === 'output')
      .map(frame => frame.text)
    expect(texts.join('\n')).toContain('build-ok')
    expect(frames.at(-1)).toMatchObject({ type: 'exit', outcome: 'succeeded', exitCode: 0 })
    expect(runner.status(buildId)).toMatchObject({ state: 'exited', outcome: 'succeeded' })
  }, 30_000)

  it('reports a failing build with outcome failed and a nonzero exit code', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e "process.exit(3)"')
    const { buildId } = await runner.start({ cwd })
    const frames = await drain(runner, buildId, new AbortController().signal)
    expect(frames.at(-1)).toMatchObject({ type: 'exit', outcome: 'failed', exitCode: 3 })
  }, 30_000)

  it('replays buffered frames to a late follower and ends after exit', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e "console.log(\'late-follower\')"')
    const { buildId } = await runner.start({ cwd })
    const live = await drain(runner, buildId, new AbortController().signal)
    expect(live.at(-1)?.type).toBe('exit')
    // The record survives the exit, so a follower attaching afterwards sees history.
    const late: SdkworkAppBuildFrame[] = []
    for await (const frame of runner.follow(buildId, new AbortController().signal)) {
      late.push(frame)
    }
    expect(late).toEqual(live)
  }, 30_000)

  it('throws build-unknown for an unrecorded build id', async () => {
    const runner = await harness()
    await expect(runner.follow('no-such-build', new AbortController().signal).next())
      .rejects.toMatchObject({ code: 'build-unknown' })
    expect(runner.status('no-such-build')).toBeUndefined()
    expect(runner.cancel('no-such-build')).toBe(false)
  })

  it('cancels a running build and emits a cancelled exit', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e "console.log(\'cancel-ready\'); setTimeout(function(){},60000)"')
    const { buildId } = await runner.start({ cwd })
    const controller = new AbortController()
    const drained = drain(runner, buildId, controller.signal)
    // Wait until the leaf process is alive before killing, or it escapes the tree walk.
    await waitForOutput(runner, buildId, 'cancel-ready')
    expect(runner.cancel(buildId)).toBe(true)
    const frames = await drained
    expect(frames.at(-1)).toMatchObject({ type: 'exit', outcome: 'cancelled' })
    expect(runner.status(buildId)).toMatchObject({ state: 'exited', outcome: 'cancelled' })
    await waitForExit(runner, buildId)
  }, 30_000)

  it('enforces the concurrency cap of three running builds', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e "console.log(\'cap-ready\'); setTimeout(function(){},30000)"')
    const first = await runner.start({ cwd })
    const second = await runner.start({ cwd })
    const third = await runner.start({ cwd })
    await Promise.all([first, second, third].map(build => waitForOutput(runner, build.buildId, 'cap-ready')))
    await expect(runner.start({ cwd })).rejects.toMatchObject({ code: 'concurrency-exceeded' })
    for (const build of [first, second, third]) runner.cancel(build.buildId)
    await Promise.all([first, second, third].map(build => waitForExit(runner, build.buildId)))
  }, 60_000)

  it('ends a follower quietly when its signal aborts mid-build', async () => {
    const runner = await harness()
    const cwd = await buildDirectory('node -e "console.log(\'abort-ready\'); setTimeout(function(){},30000)"')
    const { buildId } = await runner.start({ cwd })
    const controller = new AbortController()
    const drained = drain(runner, buildId, controller.signal)
    await waitForOutput(runner, buildId, 'abort-ready')
    controller.abort()
    const frames = await drained
    // Aborting only detaches the follower: buffered output arrived, no exit frame.
    expect(frames.at(-1)?.type).not.toBe('exit')
    expect(frames.some(frame => frame.type === 'output')).toBe(true)
    expect(runner.status(buildId)).toMatchObject({ state: 'running' })
    runner.cancel(buildId)
    await waitForExit(runner, buildId)
  }, 60_000)
})
