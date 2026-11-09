/**
 * Advance the expert-market plugin submodule to the latest commit on its
 * tracked branch, then relink it and prove the composition still loads.
 *
 * The plugin (`plugins/sdkwork-dsh-agents`) is pinned by a gitlink, not a
 * registry version, so updating it is a normal submodule update: this script
 * sequences the steps a working checkout needs and fails on the first one that
 * does, leaving the pin, the lockfile and the acceptance evidence in one
 * consistent state.
 *
 * `--check` answers the other question without moving anything: it fetches the
 * tracked branch and exits non-zero when the checkout's pin is behind it, so a
 * release gate or a scheduled job can report that the market has moved.
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = 'plugins/sdkwork-dsh-agents'
/** The branch `.gitmodules` tracks; `git submodule update --remote` follows it. */
const BRANCH = 'main'
const SPEC = 'packages/bundle/web-app/tests/built-in-expert-market.spec.ts'

const checkOnly = process.argv.includes('--check')

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim()
}

/** pnpm's JavaScript entry, so the same package manager runs on every platform. */
function pnpm() {
  const execpath = process.env.npm_execpath
  if (execpath !== undefined && /[\\/]pnpm[\\/]/u.test(execpath) && /\.[cm]?js$/u.test(execpath)) {
    return [process.execPath, execpath]
  }
  return ['pnpm']
}

function run(command, args) {
  execFileSync(command, args, { cwd: ROOT, stdio: 'inherit' })
}

/** Run a pnpm subcommand through the same package-manager entry. */
function runPnpm(args) {
  const [command, ...prefix] = pnpm()
  run(command, [...prefix, ...args])
}

const pinned = git(['-C', PLUGIN, 'rev-parse', '--short=9', 'HEAD'])
console.log(`update-expert-market: current pin ${pinned}`)

if (checkOnly) {
  // Read the tracked branch without touching the checkout. The fetch writes
  // only `.git/FETCH_HEAD`, so the working tree and the pin stay as they were;
  // comparing the two revisions is the drift question a release gate asks.
  git(['-C', PLUGIN, 'fetch', '--quiet', 'origin', BRANCH])
  const latest = git(['-C', PLUGIN, 'rev-parse', 'FETCH_HEAD'])
  if (!/^[0-9a-f]{40}$/u.test(latest)) {
    throw new Error(`update-expert-market: origin/${BRANCH} did not resolve`)
  }
  const head = git(['-C', PLUGIN, 'rev-parse', 'HEAD'])
  if (head === latest) {
    console.log(`update-expert-market: pin is current at ${pinned}`)
  } else {
    const behind = git(['-C', PLUGIN, 'rev-list', '--count', `HEAD..${latest}`])
    console.log(`update-expert-market: pin ${pinned} is ${behind} commit(s) behind origin/${BRANCH} (${latest.slice(0, 9)})`)
    console.log('update-expert-market: run `pnpm run update:expert-market` to advance it')
    process.exitCode = 1
  }
} else {
  run('git', ['submodule', 'update', '--init', '--remote', PLUGIN])
  const advanced = git(['-C', PLUGIN, 'rev-parse', '--short=9', 'HEAD'])
  console.log(`update-expert-market: pin ${advanced}`)

  // Not `--frozen-lockfile`: a plugin commit may change its own dependencies,
  // and this command is the maintainer path that is allowed to refresh the
  // lockfile.
  runPnpm(['install'])
  runPnpm(['exec', 'vitest', 'run', SPEC])

  if (pinned === advanced) {
    console.log(`update-expert-market: already current at ${advanced}`)
  } else {
    console.log(`update-expert-market: ${pinned} -> ${advanced}; commit the gitlink with pnpm-lock.yaml`)
  }
}
