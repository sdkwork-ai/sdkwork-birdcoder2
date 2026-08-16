/**
 * Fetch the pinned Windows Node binary the desktop shell bundles for helper
 * processes. Under the Electron main, `process.execPath` is the GUI-subsystem
 * Electron binary, which cannot hold a console; the harness's helper spawns
 * (the windows-acl sandbox runner, dialog workers) must run under a real
 * console-subsystem Node instead, so the whole child chain shares the app's
 * hidden console exactly like an npx/web launch under a terminal.
 *
 * Downloads the pinned node.exe once into build/node/ (the electron-builder
 * extraResources source). Skips when the binary already exists.
 */

import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

/** The pinned Node release, matching the repository engines range (^22.19 || >=24). */
const NODE_VERSION = 'v22.20.0'
const NODE_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const targetDir = join(scriptDir, '..', 'build', 'node')
const target = join(targetDir, 'node.exe')
const archive = `node-${NODE_VERSION}-win-${NODE_ARCH}.zip`
const url = `https://nodejs.org/dist/${NODE_VERSION}/${archive}`

if (existsSync(target)) {
  console.log(`fetch-node: ${target} already present, skipping`)
  process.exit(0)
}

mkdirSync(targetDir, { recursive: true })
console.log(`fetch-node: downloading ${url}`)
const response = await fetch(url)
if (!response.ok || response.body === null) {
  console.error(`fetch-node: download failed (HTTP ${response.status})`)
  process.exit(1)
}
const temp = join(targetDir, archive)
await pipeline(response.body, createWriteStream(temp))

// bsdtar reads zip archives on Windows 10+; fall back to PowerShell
// Expand-Archive when tar is unavailable.
const extracted = spawnSync('tar', ['-xf', temp, '-C', targetDir], { stdio: 'inherit' })
if (extracted.status !== 0) {
  const expanded = spawnSync('powershell', [
    '-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${temp}' -DestinationPath '${targetDir}' -Force`,
  ], { stdio: 'inherit' })
  if (expanded.status !== 0) {
    console.error('fetch-node: extraction failed with both tar and Expand-Archive')
    process.exit(1)
  }
}
spawnSync('cmd', ['/c', 'move', '/y', join(targetDir, archive.replace(/\.zip$/, ''), 'node.exe'), target], { stdio: 'inherit' })
// The extractor leaves the archive and the extracted directory; keep only the binary.
spawnSync('cmd', ['/c', 'del', '/q', temp], { stdio: 'inherit' })
spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', join(targetDir, archive.replace(/\.zip$/, ''))], { stdio: 'inherit' })
if (!existsSync(target)) {
  console.error('fetch-node: node.exe not found after extraction')
  process.exit(1)
}
console.log(`fetch-node: ${target} ready`)
