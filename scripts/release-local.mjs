#!/usr/bin/env node
/**
 * Local release packaging mirroring the GitHub workflows: builds the harness,
 * verifies the client bundles carry no @sdkwork externals, and packs the
 * desktop installer for the current platform by default (or a requested
 * platform/arch). Prints the produced installer paths for direct install.
 *
 * Usage: pnpm run release:local [--platform win|mac|linux] [--arch x64|arm64] [--ci-sim]
 *   --ci-sim  additionally rehearse the release-runner layout (pinned siblings
 *             cloned via git, no sibling node_modules) before the real build.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)

function flag(name) {
  const index = args.indexOf(`--${name}`)
  return index !== -1 ? args[index + 1] : undefined
}

const requestedPlatform = flag('platform')
const requestedArch = flag('arch')
const ciSim = args.includes('--ci-sim')

/** Map process.platform / process.arch to electron-builder names. */
function hostPlatform() {
  switch (process.platform) {
    case 'win32': return 'win'
    case 'darwin': return 'mac'
    case 'linux': return 'linux'
    default: throw new Error(`release:local: unsupported host platform ${process.platform}`)
  }
}
function hostArch() {
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

const platform = requestedPlatform ?? hostPlatform()
const arch = requestedArch ?? hostArch()
if (!['win', 'mac', 'linux'].includes(platform)) throw new Error(`release:local: unknown platform ${platform}`)
if (!['x64', 'arm64'].includes(arch)) throw new Error(`release:local: unknown arch ${arch}`)

function run(script, cwd = ROOT) {
  console.log(`\n[release:local] pnpm run ${script}`)
  const result = spawnSync('pnpm', ['run', script], { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) {
    console.error(`[release:local] FAILED: pnpm run ${script} exited ${String(result.status)}`)
    process.exit(result.status ?? 1)
  }
}

function runRaw(command, cwd = ROOT) {
  console.log(`\n[release:local] ${command}`)
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error(`[release:local] FAILED: ${command} exited ${String(result.status)}`)
    process.exit(result.status ?? 1)
  }
}

if (ciSim) {
  console.log('[release:local] rehearsing the release-runner layout (git-cloned pinned siblings)')
  const sim = resolve(dirname(fileURLToPath(import.meta.url)), 'simulate-ci-build.mjs')
  const result = spawnSync(process.execPath, [sim, '--steps', 'build:lib'], { cwd: ROOT, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('[release:local] CI-layout rehearsal failed; fix the build before packaging')
    process.exit(result.status ?? 1)
  }
}

// 1. Full official build (lib + client bundles + web).
run('build:official')
// The build gate already runs verify-sdkwork-dependencies, which asserts the
// client bundles leave no @sdkwork/* specifier external.

// 2. Desktop shell build (icons, generated assets).
run('build', join(ROOT, 'apps/desktop'))

// 3. electron-builder for the requested target into release-build/ (kept out
//    of release/ so a locked prior output cannot fail the pack).
const outputDir = join(ROOT, 'apps/desktop/release-build')
mkdirSync(outputDir, { recursive: true })
const builderArgs = platform === 'win' ? `--${platform} --${arch}` : `--${platform} --${arch}`
runRaw(
  `pnpm --filter @deepseek-ai/dsh-desktop exec electron-builder --publish never --config.directories.output=release-build ${builderArgs}`,
  join(ROOT, 'apps/desktop'),
)

// 4. Report the produced installers.
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const artifacts = readdirSync(outputDir).filter(name => !name.endsWith('.blockmap') && !name.includes('__uninstaller'))
console.log('\n[release:local] packaged artifacts:')
for (const name of artifacts.sort()) {
  const full = join(outputDir, name)
  console.log(`  ${full}`)
}
console.log(`\n[release:local] done: ${platform}-${arch} build of ${version}; install the primary installer above to test.`)
