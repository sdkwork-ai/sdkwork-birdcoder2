import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Single ESM bundle. The Python-side code is not TypeScript and ships verbatim
 * under `py/` (whitelisted in package.json `files`) — no build step needed.
 */
const HOST_LIBRARY = {
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARY, options, meta))
