/**
 * Shipped-composition activation smoke: every row the web profile mounts must
 * activate. The loader reports failed entries only as `dsh: warning: N entries
 * did not activate` plus per-entry import diagnostics, so a plugin whose
 * committed or derived artifacts went stale (an upstream merge that changed
 * inlined workspace sources, a dependency misdeclared as a devDependency) degrades
 * the running product without failing any build gate. This spec boots the real
 * source-plane composition (`dsh web` through tsx, the same launch the
 * developer and the source-lane CI use, keyless against an isolated home) and
 * fails on either failure signature, so the class is caught by the ordinary
 * test lane instead of at a user's console.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const cliEntry = join(repoRoot, 'apps/cli/src/bin.ts')

/** Boot the source-plane web profile, wait for its settled URL, then dispose through SIGTERM. */
function runSourceWeb(cwd: string): Promise<{ output: string; code: number }> {
  return new Promise((resolveRun, rejectRun) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DEEPSEEK_API_KEY: 'dsh-composition-smoke-dummy-key',
      DSH_HOME: join(cwd, '.dsh'),
    }
    delete env.DEEPSEEK_BASE_URL
    delete env.NODE_OPTIONS
    delete env.NODE_NO_WARNINGS
    const child = spawn(process.execPath, [
      '--import', 'tsx/esm',
      cliEntry,
      'web',
      '--no-open',
      '--host', '127.0.0.1',
      '--port', '0',
    ], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let settled = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    const collect = (chunk: string): void => { output += chunk }
    child.stdout.on('data', (chunk: string) => {
      collect(chunk)
      if (!settled && /dsh web: http:\/\/127\.0\.0\.1:\d+/u.test(output)) {
        settled = true
        child.kill('SIGTERM')
      }
    })
    child.stderr.on('data', collect)
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectRun(new Error(`source web CLI did not settle within 110s\noutput:\n${output}`))
    }, 110_000)
    child.on('error', (error) => {
      clearTimeout(timer)
      rejectRun(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (!settled) {
        rejectRun(new Error(`source web CLI exited before settled startup (code ${String(code)})\noutput:\n${output}`))
        return
      }
      resolveRun({ output, code: code ?? -1 })
    })
  })
}

describe('shipped composition activation', () => {
  it('activates every mounted row of the shipped web composition', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-composition-activation-'))
    try {
      const result = await runSourceWeb(cwd)
      const failedEntries = result.output
        .split('\n')
        .filter(line => /did not activate|failed to import/u.test(line))
      expect(failedEntries, `deactivated composition rows detected in boot output:\n${failedEntries.join('\n')}`).toEqual([])
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  }, 120_000)
})
