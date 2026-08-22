#!/usr/bin/env node
/**
 * Run one tsdown lib pass with `DSH_BUILD_FACE` exported to `process.env`.
 * Nested workspace configs on Linux CI may receive an empty inline `env` from
 * tsdown; boot packages read the face from `process.env` as a fallback.
 * @module scripts/run-tsdown-build-face
 */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const face = process.argv[2]
if (face !== 'host' && face !== 'client') {
  throw new Error(`run-tsdown-build-face: expected host or client, received ${String(face)}`)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.env.DSH_BUILD_FACE = face

const result = spawnSync('pnpm', ['exec', 'tsdown', '--env.DSH_BUILD_FACE', face], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  shell: true,
})

if (result.error !== undefined) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
