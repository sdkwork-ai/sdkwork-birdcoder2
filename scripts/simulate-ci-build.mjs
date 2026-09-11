#!/usr/bin/env node
/**
 * Rehearse the release runner locally: clone this repository and every SDKWork
 * sibling `sdkwork.workflow.json` declares into a throwaway directory tree via
 * git (no node_modules in the siblings, exactly like setup-sdkwork-siblings on
 * CI), install with the frozen lockfile, and run the requested build step.
 * Passes only if the full step passes in that layout — the same layout the
 * GitHub workflows build.
 *
 * Usage: node scripts/simulate-ci-build.mjs [--steps <pnpm script>]
 *   default steps: build:official
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

/** The current local HEAD of a sibling checkout, used when no pin is declared. */
function localHead(directory) {
  const result = spawnSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    throw new Error(`failed to read the local HEAD of ${directory}`)
  }
  return result.stdout.trim()
}

const parent = mkdtempSync(join(tmpdir(), 'dsh-ci-sim-'))
const checkout = join(parent, 'sdkwork-birdcoder2')
try {
  console.log(`[ci-sim] checkout: ${checkout}`)
  // 1. clone this repository (local clone, complete history not needed)
  if (run('git', ['clone', '--quiet', '--no-hardlinks', ROOT, checkout], parent) !== 0) {
    throw new Error('failed to clone this repository')
  }

  // 2. clone every declared sibling at its pinned commit, bare of node_modules.
  // DEPENDENCY_MANAGEMENT_SPEC.md section 5.2 makes `sdkwork.workflow.json`
  // `dependencies[]` the rehearsal's dependency authority: the pinned commit
  // when one is declared, otherwise the sibling's current local HEAD.
  const workflow = JSON.parse(readFileSync(join(ROOT, 'sdkwork.workflow.json'), 'utf8'))
  for (const dependency of workflow.dependencies ?? []) {
    const name = dependency.id
    const source = join(ROOT, '..', name)
    const dest = join(parent, name)
    if (!existsSync(join(source, '.git'))) {
      console.log(`[ci-sim] skip ${name}: no local checkout at ${source}`)
      continue
    }
    const commit = typeof dependency.ref === 'string' && dependency.ref !== ''
      ? dependency.ref
      : localHead(source)
    // Fetch the exact pinned commit, the same way setup-sdkwork-siblings does
    // on CI: a plain clone would only carry branch objects, and pinned commits
    // can sit on detached heads.
    if (run('git', ['init', '--quiet', dest], parent) !== 0) throw new Error(`failed to init ${name}`)
    if (run('git', ['remote', 'add', 'origin', source], dest) !== 0) throw new Error(`failed to add remote for ${name}`)
    if (run('git', ['fetch', '--quiet', '--depth', '1', 'origin', commit], dest) !== 0) {
      throw new Error(`failed to fetch ${name} @ ${commit}`)
    }
    if (run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], dest) !== 0) {
      throw new Error(`failed to check out ${name} @ ${commit}`)
    }
    console.log(`[ci-sim] sibling ${name} @ ${commit.slice(0, 12)}`)
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
