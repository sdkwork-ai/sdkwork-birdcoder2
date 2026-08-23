#!/usr/bin/env node
/**
 * Rehearse the release runner locally: clone this repository and every pinned
 * SDKWork sibling into a throwaway directory tree via git (no node_modules in
 * the siblings, exactly like setup-sdkwork-siblings on CI), install with the
 * frozen lockfile, and run the requested build step. Passes only if the full
 * step passes in that layout — the same layout the GitHub workflows build.
 *
 * Usage: node scripts/simulate-ci-build.mjs [--steps <pnpm script>]
 *   default steps: build:official
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const steps = process.argv.includes('--steps')
  ? process.argv[process.argv.indexOf('--steps') + 1]
  : 'build:official'

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw result.error
  return result.status ?? 1
}

const parent = mkdtempSync(join(tmpdir(), 'dsh-ci-sim-'))
const checkout = join(parent, 'sdkwork-birdcoder2')
try {
  console.log(`[ci-sim] checkout: ${checkout}`)
  // 1. clone this repository (local clone, complete history not needed)
  if (run('git', ['clone', '--quiet', '--no-hardlinks', ROOT, checkout], parent) !== 0) {
    throw new Error('failed to clone this repository')
  }

  // 2. clone every pinned sibling at its pinned commit, bare of node_modules
  const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts/sdkwork-sources.manifest.json'), 'utf8'))
  for (const repository of manifest.repositories) {
    const source = join(ROOT, '..', repository.name)
    const dest = join(parent, repository.name)
    if (!existsSync(join(source, '.git'))) {
      console.log(`[ci-sim] skip ${repository.name}: no local checkout at ${source}`)
      continue
    }
    // Local clone for speed, then detach at the pinned commit.
    if (run('git', ['clone', '--quiet', '--no-hardlinks', source, dest], parent) !== 0) {
      throw new Error(`failed to clone ${repository.name}`)
    }
    if (run('git', ['checkout', '--quiet', '--detach', repository.commit], dest) !== 0) {
      throw new Error(`failed to check out ${repository.name} @ ${repository.commit}`)
    }
    // A local checkout may carry uncommitted work; the runner must not see it.
    run('git', ['reset', '--hard', '--quiet', 'HEAD'], dest)
    console.log(`[ci-sim] sibling ${repository.name} @ ${repository.commit.slice(0, 12)}`)
  }

  // 3. frozen install (shared pnpm store keeps this fast)
  if (run('pnpm', ['install', '--frozen-lockfile'], checkout) !== 0) {
    throw new Error('frozen install failed')
  }

  // 4. run the requested step
  console.log(`[ci-sim] running: pnpm run ${steps}`)
  const status = run('pnpm', ['run', steps], checkout)
  if (status !== 0) {
    console.error(`[ci-sim] FAILED: pnpm run ${steps} exited ${status}`)
    process.exitCode = status
  } else {
    console.log(`[ci-sim] PASSED: pnpm run ${steps}`)
  }
} finally {
  // Keep the tree on failure for inspection: print the path instead of deleting.
  if (process.exitCode !== undefined && process.exitCode !== 0) {
    console.log(`[ci-sim] tree kept for inspection at ${parent}`)
  } else {
    rmSync(parent, { recursive: true, force: true })
  }
}
