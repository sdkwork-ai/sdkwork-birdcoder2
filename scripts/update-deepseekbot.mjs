/**
 * Advance the assistant plugin submodule to the latest commit on its tracked
 * branch, then rebuild it and prove the composition still loads.
 *
 * The plugin is pinned by a gitlink (not a registry version), so updating it is
 * a normal submodule update: this script only sequences the steps a working
 * checkout needs and fails on the first one that does, leaving the pin, the
 * lockfile and the build artifacts in one consistent state.
 */

import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN = 'plugins/sdkwork-deepseekbot'
const SPEC = 'packages/bundle/web-app/tests/built-in-assistant.spec.ts'

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

const before = git(['-C', PLUGIN, 'rev-parse', '--short=9', 'HEAD'])
console.log(`update-deepseekbot: current pin ${before}`)
run('git', ['submodule', 'update', '--init', '--remote', PLUGIN])
const after = git(['-C', PLUGIN, 'rev-parse', '--short=9', 'HEAD'])
console.log(`update-deepseekbot: pin ${after}`)

// Not `--frozen-lockfile`: a plugin commit may change its own dependencies, and
// this command is the maintainer path that is allowed to refresh the lockfile.
runPnpm(['install'])
run(process.execPath, [resolve(ROOT, 'scripts', 'build-deepseekbot.mjs')])
runPnpm(['exec', 'vitest', 'run', SPEC])

if (before === after) {
  console.log(`update-deepseekbot: already current at ${after}`)
} else {
  console.log(`update-deepseekbot: ${before} -> ${after}; commit the gitlink with pnpm-lock.yaml`)
}
