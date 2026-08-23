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
 * Usage: pnpm run release:gitdependencylocal [--platform win|mac|linux] [--arch x64|arm64] [--inspect [port]]
 *
 * `--inspect [port]` bakes the V8 inspector port into the installer (default
 * 9229): the packaged main process restarts itself with `--inspect=<port>` on
 * first launch, then runs under the debugger. Omitted by default — packaged
 * builds ship with debugging off.
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

// `--inspect` (default port 9229), `--inspect <port>`, or `--inspect=<port>`.
// The value reaches the desktop tsdown config through the environment, which
// the packed main process then turns into a first-launch `--inspect` relaunch.
let inspectPort = ''
{
  const index = args.indexOf('--inspect')
  if (index !== -1) {
    const next = args[index + 1]
    inspectPort = next !== undefined && /^\d+$/.test(next) ? next : '9229'
  } else {
    const inline = args.find(arg => arg.startsWith('--inspect='))
    if (inline !== undefined) inspectPort = inline.slice('--inspect='.length) || '9229'
  }
  if (inspectPort !== '' && !/^\d+$/.test(inspectPort)) {
    throw new Error(`release:gitdependencylocal: --inspect expects a port number, received ${inspectPort}`)
  }
}
if (inspectPort !== '') {
  process.env.DSH_PACKED_INSPECT = inspectPort
  console.log(`[release:gitdependencylocal] inspector enabled: --inspect=${inspectPort}`)
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} exited ${String(result.status)}`)
}

/** Copy the working tree (excluding build outputs) so uncommitted fixes participate. */
const COPY_EXCLUDES = new Set(['node_modules', 'lib', 'dist', 'release', 'release-build', '.pnpm-store', '.cache', 'coverage', '.gitdependency-local'])
function copyTree(source, dest) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (COPY_EXCLUDES.has(entry.name)) continue
    if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) continue
    const from = join(source, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true })
      copyTree(from, to)
    } else if (entry.isFile()) {
      cpSync(from, to)
    }
  }
}

/** Run git without throwing; returns the exit status. */
function gitQuiet(args, cwd) {
  const result = spawnSync('git', args, { cwd, stdio: 'ignore' })
  return result.status ?? 1
}

function run(command, args, cwd) {
  console.log(`\n[release:gitdependencylocal] ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) throw new Error(`${command} exited ${String(result.status)}`)
}

let failed = false
const parent = mkdtempSync(join(tmpdir(), 'dsh-gitdependency-'))
const checkout = join(parent, 'sdkwork-birdcoder2')
try {
  console.log(`[release:gitdependencylocal] git-dependency tree: ${parent}`)
  // Copy the working tree (pinned siblings come via git below) so uncommitted
  // fixes participate; the tree is the same source the workflow would build.
  mkdirSync(checkout, { recursive: true })
  copyTree(ROOT, checkout)
  console.log('[release:gitdependencylocal] working tree copied')

  const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts/sdkwork-sources.manifest.json'), 'utf8'))
  for (const repository of manifest.repositories) {
    const source = join(ROOT, '..', repository.name)
    const dest = join(parent, repository.name)
    // Fetch the exact pinned commit, the same way setup-sdkwork-siblings does
    // on CI: a plain clone would only carry branch objects, and pinned commits
    // can sit on detached heads. The local checkout may have moved past the
    // pin (its objects pruned), so fall back to the remote repository.
    git(['init', '--quiet', dest], parent)
    // Windows MAX_PATH caps checkout materialization for siblings carrying
    // generated Java sources and docs with >260-char paths.
    git(['config', 'core.longpaths', 'true'], dest)
    git(['remote', 'add', 'origin', source], dest)
    if (gitQuiet(['fetch', '--quiet', '--depth', '1', 'origin', repository.commit], dest) !== 0) {
      const token = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' }).stdout?.trim()
      const remote = `https://x-access-token:${token ?? ''}@github.com/sdkwork-ai/${repository.name}.git`
      let fetched = false
      for (let attempt = 1; attempt <= 3 && !fetched; attempt++) {
        const result = spawnSync('git', ['fetch', '--quiet', '--depth', '1', remote, repository.commit], {
          cwd: dest, stdio: 'inherit',
        })
        if (result.status === 0) fetched = true
        else if (attempt < 3) {
          console.log(`[release:gitdependencylocal] retrying remote fetch for ${repository.name} (attempt ${attempt})`)
          spawnSync('node', ['-e', 'setTimeout(() => {}, 2000)'], { stdio: 'ignore' })
        }
      }
      if (!fetched) throw new Error(`failed to fetch ${repository.name} @ ${repository.commit}`)
    }
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
  // Refresh the whole directory so stale unpacked trees from earlier runs
  // cannot shadow a fresh build.
  const localOutput = join(ROOT, 'apps/desktop/release-build')
  rmSync(localOutput, { recursive: true, force: true })
  mkdirSync(localOutput, { recursive: true })
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
  let copied = 0
  for (const entry of readdirSync(outputDir, { withFileTypes: true })) {
    if (entry.name.includes('__uninstaller') || entry.name.endsWith('.blockmap')) continue
    const source = join(outputDir, entry.name)
    const target = join(localOutput, entry.name)
    if (entry.isDirectory()) {
      cpSync(source, target, { recursive: true })
    } else {
      cpSync(source, target)
    }
    copied++
  }
  console.log(`\n[release:gitdependencylocal] ${copied} artifact(s) copied to apps/desktop/release-build/ for ${version} (${platform}-${arch}):`)
  for (const name of readdirSync(localOutput).filter(n => !n.includes('__uninstaller') && !n.endsWith('.blockmap')).sort()) {
    console.log(`  ${join(localOutput, name)}`)
  }
  console.log('\n[release:gitdependencylocal] done — install the primary installer above to test.')
} catch (error) {
  failed = true
  throw error
} finally {
  if (failed) {
    console.log(`[release:gitdependencylocal] tree kept for inspection at ${parent}`)
  } else {
    rmSync(parent, { recursive: true, force: true })
  }
}
