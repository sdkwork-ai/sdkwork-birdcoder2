#!/usr/bin/env node
/**
 * Local release packaging with the same git-dependency layout as the GitHub
 * workflows: this repository and every pinned SDKWork sibling are cloned via
 * git into a throwaway tree (no sibling node_modules), the harness is built
 * there with the frozen lockfile, and the desktop installer is packed for the
 * current platform by default (or a requested platform/arch). The produced
 * installers are copied back under apps/desktop/release-build/ so they can be
 * installed directly from the working tree.
 *
 * Usage: pnpm run release:gitdependencylocal [--platform win|mac|linux] [--arch x64|arm64]
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)

function flag(name) {
  const index = args.indexOf(`--${name}`)
  return index !== -1 ? args[index + 1] : undefined
}

function hostPlatform() {
  switch (process.platform) {
    case 'win32': return 'win'
    case 'darwin': return 'mac'
    case 'linux': return 'linux'
    default: throw new Error(`release:gitdependencylocal: unsupported host platform ${process.platform}`)
  }
}

const platform = flag('platform') ?? hostPlatform()
const arch = flag('arch') ?? (process.arch === 'arm64' ? 'arm64' : 'x64')
if (!['win', 'mac', 'linux'].includes(platform)) throw new Error(`release:gitdependencylocal: unknown platform ${platform}`)
if (!['x64', 'arm64'].includes(arch)) throw new Error(`release:gitdependencylocal: unknown arch ${arch}`)

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} exited ${String(result.status)}`)
}

function run(command, args, cwd) {
  console.log(`\n[release:gitdependencylocal] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`${command} exited ${String(result.status)}`)
}

const parent = mkdtempSync(join(tmpdir(), 'dsh-gitdependency-'))
const checkout = join(parent, 'sdkwork-birdcoder2')
try {
  console.log(`[release:gitdependencylocal] git-dependency tree: ${parent}`)
  git(['clone', '--quiet', '--no-hardlinks', ROOT, checkout], parent)

  const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts/sdkwork-sources.manifest.json'), 'utf8'))
  for (const repository of manifest.repositories) {
    const source = join(ROOT, '..', repository.name)
    if (!existsSync(join(source, '.git'))) continue
    const dest = join(parent, repository.name)
    // Fetch the exact pinned commit, the same way setup-sdkwork-siblings does
    // on CI: a plain clone would only carry branch objects, and pinned commits
    // can sit on detached heads.
    git(['init', '--quiet', dest], parent)
    git(['remote', 'add', 'origin', source], dest)
    git(['fetch', '--quiet', '--depth', '1', 'origin', repository.commit], dest)
    git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], dest)
    console.log(`[release:gitdependencylocal] sibling ${repository.name} @ ${repository.commit.slice(0, 12)}`)
  }

  run('pnpm', ['install', '--frozen-lockfile'], checkout)
  run('pnpm', ['run', 'build:official'], checkout)
  run('pnpm', ['run', 'build'], join(checkout, 'apps/desktop'))

  const outputDir = join(checkout, 'apps/desktop/release-build')
  mkdirSync(outputDir, { recursive: true })
  run('pnpm', [
    '--filter', '@deepseek-ai/dsh-desktop', 'exec', 'electron-builder',
    '--publish', 'never', '--config.directories.output=release-build', `--${platform}`, `--${arch}`,
  ], join(checkout, 'apps/desktop'))

  // Copy the installers back into the working tree for direct install.
  const localOutput = join(ROOT, 'apps/desktop/release-build')
  mkdirSync(localOutput, { recursive: true })
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  let copied = 0
  for (const name of readdirSync(outputDir)) {
    if (name.includes('__uninstaller') || name.endsWith('.blockmap')) continue
    cpSync(join(outputDir, name), join(localOutput, name))
    copied++
  }
  console.log(`\n[release:gitdependencylocal] ${copied} artifact(s) copied to apps/desktop/release-build/ for ${version} (${platform}-${arch}):`)
  for (const name of readdirSync(localOutput).filter(n => !n.includes('__uninstaller') && !n.endsWith('.blockmap')).sort()) {
    console.log(`  ${join(localOutput, name)}`)
  }
  console.log('\n[release:gitdependencylocal] done — install the primary installer above to test.')
} finally {
  rmSync(parent, { recursive: true, force: true })
}
