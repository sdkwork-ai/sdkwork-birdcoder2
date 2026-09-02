/**
 * SDKWork app build capability: package-manager build runs with streamed
 * output. One spawned process per accepted request, per-build frame buffer
 * for late followers, tree-kill cancellation, and bounded concurrency.
 * The wire face over this seam is the `sdkwork-app-build-controller` Remote.
 */

import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { SdkworkAppBuildError } from './errors.ts'
import type {
  SdkworkAppBuildExitFrame,
  SdkworkAppBuildFrame,
  SdkworkAppBuildOutcome,
  SdkworkAppBuildStartRequest,
  SdkworkAppBuildStartValue,
  SdkworkAppBuildStatus,
  SdkworkAppBuildStream,
} from './types.ts'

export type * from './types.ts'
export { SdkworkAppBuildError } from './errors.ts'
export type { SdkworkAppBuildErrorCode } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork app build capability: package-manager build runs. */
    sdkworkAppBuild: SdkworkAppBuildRunner
  }
}

/** Builds allowed to run at once; a build is minutes-long, so this stays small. */
const MAX_RUNNING_BUILDS = 3

/** Output frames retained per build for late followers; oldest output drops first. */
const MAX_BUFFERED_OUTPUT_FRAMES = 2000

/** Finished build records retained for status/follow; oldest exit evicts first. */
const MAX_FINISHED_RECORDS = 20

/** Argument charset safe to join into a shell command without quoting. */
const SAFE_ARGUMENT = /^[A-Za-z0-9_@%+=:,./\\-]+$/

/**
 * Grace period between a killed shell's `exit` and a `close` that never
 * arrives because an escaped grandchild still holds the stdio pipes.
 */
const CANCEL_EXIT_GRACE_MS = 1500

/** Internal mutable record behind one build. */
interface BuildRecord {
  buildId: string
  command: string
  cwd: string
  state: SdkworkAppBuildStatus['state']
  outcome: SdkworkAppBuildOutcome | null
  exitCode: number | null
  signal: string | null
  durationMs: number | null
  cancelRequested: boolean
  child: ChildProcess | null
  startedAt: number
  /** Complete frame history; `started` stays first, `exit` is appended last. */
  frames: SdkworkAppBuildFrame[]
  listeners: Set<(frame: SdkworkAppBuildFrame) => void>
}

/** Resolved package-manager invocation for one build. */
interface PackageManagerPlan {
  name: 'pnpm' | 'yarn' | 'npm'
  command: string
}

/**
 * Detect the package manager from the lockfile present in the build
 * directory, then assemble the build command. Arguments join after the
 * conventional `--` separator (yarn classic accepts it for run scripts).
 */
function planPackageManager(cwd: string, script: string, args: readonly string[]): PackageManagerPlan {
  for (const arg of args) {
    if (!SAFE_ARGUMENT.test(arg)) {
      throw new SdkworkAppBuildError(
        'script-missing',
        `build argument "${arg}" contains characters outside the safe set`,
      )
    }
  }
  const suffix = args.length === 0 ? '' : ` -- ${[...args].join(' ')}`
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return { name: 'pnpm', command: `pnpm run ${script}${suffix}` }
  }
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return { name: 'yarn', command: `yarn run ${script}${suffix}` }
  }
  return { name: 'npm', command: `npm run ${script}${suffix}` }
}

/** Decode a pending partial line into complete lines. */
function drainLines(pending: string): { lines: string[]; rest: string } {
  const lines: string[] = []
  let rest = pending
  let index = rest.indexOf('\n')
  while (index >= 0) {
    const line = rest.slice(0, index).replace(/\r$/, '')
    if (line !== '') lines.push(line)
    rest = rest.slice(index + 1)
    index = rest.indexOf('\n')
  }
  return { lines, rest }
}

/** The build runner service. Owns every spawned process and its frame history. */
export class SdkworkAppBuildRunner extends Service {
  private readonly records = new Map<string, BuildRecord>()

  /** @param ctx - host context. */
  constructor(ctx: Context) {
    super(ctx, 'sdkworkAppBuild')
  }

  /**
   * Validate the request against the filesystem, spawn the package-manager
   * build, and record it. Output flows to followers, not to this call.
   * @param request - absolute build directory, optional script name, optional
   *   script arguments.
   * @returns the spawn facts the caller follows by build id.
   */
  async start(request: SdkworkAppBuildStartRequest): Promise<SdkworkAppBuildStartValue> {
    if (!isAbsolute(request.cwd)) {
      throw new SdkworkAppBuildError('cwd-unreadable', `build cwd must be absolute, got "${request.cwd}"`)
    }
    const cwd = resolve(request.cwd)
    const directory = statSync(cwd, { throwIfNoEntry: false })
    if (directory === undefined || !directory.isDirectory()) {
      throw new SdkworkAppBuildError('cwd-unreadable', `build cwd does not exist or is not a directory: "${cwd}"`)
    }
    const manifestPath = join(cwd, 'package.json')
    if (!existsSync(manifestPath)) {
      throw new SdkworkAppBuildError('no-package-json', `no package.json under "${cwd}"`)
    }
    let scripts: unknown
    try {
      scripts = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { scripts?: unknown }).scripts
    } catch (error: unknown) {
      throw new SdkworkAppBuildError(
        'no-package-json',
        `package.json under "${cwd}" is unreadable: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
    const script = request.script === undefined || request.script.trim() === ''
      ? 'build'
      : request.script.trim()
    if (
      typeof scripts !== 'object' || scripts === null
      || typeof (scripts as Record<string, unknown>)[script] !== 'string'
    ) {
      const available = typeof scripts === 'object' && scripts !== null
        ? Object.keys(scripts).join(', ')
        : '(none)'
      throw new SdkworkAppBuildError(
        'script-missing',
        `package.json under "${cwd}" has no "${script}" script; available: ${available}`,
      )
    }
    const running = [...this.records.values()].filter(record => record.state === 'running')
    if (running.length >= MAX_RUNNING_BUILDS) {
      throw new SdkworkAppBuildError(
        'concurrency-exceeded',
        `${running.length} builds are already running; cancel one or wait for an exit`,
      )
    }
    const plan = planPackageManager(cwd, script, request.args ?? [])
    const buildId = randomUUID()
    const record: BuildRecord = {
      buildId,
      command: plan.command,
      cwd,
      state: 'running',
      outcome: null,
      exitCode: null,
      signal: null,
      durationMs: null,
      cancelRequested: false,
      child: null,
      startedAt: Date.now(),
      frames: [],
      listeners: new Set(),
    }
    this.records.set(buildId, record)
    this.emit(record, {
      type: 'started', buildId, command: record.command, cwd,
    })
    this.spawn(record)
    return { buildId, command: record.command, cwd }
  }

  /**
   * Follow one build's frames: the buffered history first, then live frames,
   * ending right after the exit frame. Aborting the signal ends the
   * iteration quietly; the build itself is unaffected (cancel is explicit).
   * @param buildId - a known build id.
   * @param signal - follower lifetime.
   */
  async *follow(buildId: string, signal: AbortSignal): AsyncIterable<SdkworkAppBuildFrame> {
    const record = this.records.get(buildId)
    if (record === undefined) {
      throw new SdkworkAppBuildError('build-unknown', `no build recorded under id "${buildId}"`)
    }
    const wakeups: Array<() => void> = []
    // Every frame lands in `record.frames` synchronously before listeners run,
    // so the listener only needs to wake the awaiting iterator; the delivered
    // index replays history without duplicating live frames.
    const listener = (): void => {
      const wakeup = wakeups.shift()
      if (wakeup !== undefined) wakeup()
    }
    const onAbort = (): void => {
      const wakeup = wakeups.shift()
      if (wakeup !== undefined) wakeup()
    }
    record.listeners.add(listener)
    signal.addEventListener('abort', onAbort, { once: true })
    let delivered = 0
    try {
      while (true) {
        while (delivered < record.frames.length) {
          const frame = record.frames[delivered]
          if (frame === undefined) break
          delivered += 1
          yield frame
          if (frame.type === 'exit') return
        }
        if (signal.aborted) return
        await new Promise<void>(wake => {
          if (signal.aborted || delivered < record.frames.length) {
            wake()
            return
          }
          wakeups.push(wake)
        })
        if (signal.aborted) return
      }
    } finally {
      record.listeners.delete(listener)
      signal.removeEventListener('abort', onAbort)
    }
  }

  /**
   * Cancel one running build: request a tree kill and let the process's own
   * exit path emit the terminal frame.
   * @param buildId - target build.
   * @returns whether a running build was found and killed.
   */
  cancel(buildId: string): boolean {
    const record = this.records.get(buildId)
    if (record === undefined || record.state !== 'running' || record.child === null) return false
    record.cancelRequested = true
    const child = record.child
    if (process.platform === 'win32') {
      if (child.pid !== undefined) {
        // shell:true wraps the command in one cmd.exe, so the whole tree dies here.
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      }
      return true
    }
    // The child runs detached in its own process group; a negative pid kills the group.
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    }
    return true
  }

  /**
   * Read one build's point-in-time status with its retained output lines.
   * @param buildId - a known build id.
   */
  status(buildId: string): SdkworkAppBuildStatus | undefined {
    const record = this.records.get(buildId)
    if (record === undefined) return undefined
    return {
      buildId: record.buildId,
      command: record.command,
      cwd: record.cwd,
      state: record.state,
      outcome: record.outcome,
      exitCode: record.exitCode,
      signal: record.signal,
      durationMs: record.durationMs,
      lines: record.frames.filter(
        (frame): frame is Extract<SdkworkAppBuildFrame, { type: 'output' }> => frame.type === 'output',
      ),
    }
  }

  /** Spawn the recorded command and wire its streams into the frame history. */
  private spawn(record: BuildRecord): void {
    const child = spawn(record.command, {
      cwd: record.cwd,
      shell: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    record.child = child
    const pending: Record<SdkworkAppBuildStream, string> = { stdout: '', stderr: '' }
    const consume = (stream: SdkworkAppBuildStream, chunk: string): void => {
      pending[stream] += chunk
      const decoded = drainLines(pending[stream])
      pending[stream] = decoded.rest
      for (const line of decoded.lines) {
        this.emit(record, { type: 'output', buildId: record.buildId, stream, text: line })
      }
    }
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', chunk => consume('stdout', chunk as string))
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', chunk => consume('stderr', chunk as string))
    child.on('error', () => {
      // Spawn-level failure (command not found, cwd rejected): one exit frame
      // still terminates every follower. The error itself rides stderr paths
      // only when the shell got that far; the frame is the wire truth.
      this.finish(record, {
        type: 'exit',
        buildId: record.buildId,
        outcome: record.cancelRequested ? 'cancelled' : 'failed',
        exitCode: null,
        signal: null,
        durationMs: Date.now() - record.startedAt,
      })
    })
    child.on('close', (code, signal) => {
      for (const stream of ['stdout', 'stderr'] as const) {
        const rest = pending[stream].replace(/\r$/, '')
        if (rest !== '') {
          this.emit(record, { type: 'output', buildId: record.buildId, stream, text: rest })
        }
      }
      const outcome: SdkworkAppBuildOutcome = record.cancelRequested
        ? 'cancelled'
        : code === 0 ? 'succeeded' : 'failed'
      this.finish(record, {
        type: 'exit',
        buildId: record.buildId,
        outcome,
        exitCode: code,
        signal: signal ?? null,
        durationMs: Date.now() - record.startedAt,
      })
    })
    child.on('exit', (code, signal) => {
      // Cancellation races tree enumeration: a grandchild spawned after the
      // taskkill walk survives cmd.exe and keeps the stdio pipes open, so
      // 'close' may never arrive. Deliver the cancelled exit after a grace
      // period; `finish` is idempotent, so an on-time close simply wins.
      if (!record.cancelRequested || record.state === 'exited') return
      const grace = setTimeout(() => {
        this.finish(record, {
          type: 'exit',
          buildId: record.buildId,
          outcome: 'cancelled',
          exitCode: code,
          signal: signal ?? null,
          durationMs: Date.now() - record.startedAt,
        })
      }, CANCEL_EXIT_GRACE_MS)
      grace.unref()
    })
  }

  /** Record one frame, deliver it to live followers, and cap the buffer. */
  private emit(record: BuildRecord, frame: SdkworkAppBuildFrame): void {
    if (frame.type === 'output' && record.frames.length >= MAX_BUFFERED_OUTPUT_FRAMES) {
      // Keep `started` (index 0) and drop the oldest output line instead.
      record.frames.splice(1, 1)
    }
    record.frames.push(frame)
    for (const listener of record.listeners) listener(frame)
  }

  /** Install the terminal frame, mark the record exited, and evict old exits. */
  private finish(record: BuildRecord, frame: SdkworkAppBuildExitFrame): void {
    if (record.state === 'exited') return
    record.state = 'exited'
    record.outcome = frame.outcome
    record.exitCode = frame.exitCode
    record.signal = frame.signal
    record.durationMs = frame.durationMs
    record.child = null
    this.emit(record, frame)
    const exited = [...this.records.values()]
      .filter(candidate => candidate.state === 'exited')
      .sort((left, right) => left.startedAt - right.startedAt)
    for (let index = MAX_FINISHED_RECORDS; index < exited.length; index += 1) {
      const stale = exited[index]
      if (stale !== undefined) this.records.delete(stale.buildId)
    }
  }
}

export default SdkworkAppBuildRunner
