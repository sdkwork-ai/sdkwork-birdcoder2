#!/usr/bin/env node
/**
 * Removes only this root's own build output. Every target is resolved and
 * checked against the application root before deletion.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hostRoot = path.join(appRoot, 'packages', 'sdkwork-birdcoder2-pad-tauri')
const targets = [
  path.join(appRoot, 'dist'),
  path.join(appRoot, '.tmp'),
  path.join(appRoot, 'coverage'),
  path.join(hostRoot, 'src-tauri', 'target'),
  path.join(hostRoot, 'src-tauri', '.tauri'),
]

for (const target of targets) {
  const resolved = path.resolve(target)
  if (resolved !== appRoot && !resolved.startsWith(`${appRoot}${path.sep}`)) {
    throw new Error(`refusing to remove path outside the pad application root: ${resolved}`)
  }
}

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true })
}
console.log(`cleaned ${targets.length} build-output path(s) under ${appRoot}`)