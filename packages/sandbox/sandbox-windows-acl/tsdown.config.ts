import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

// The confinement runner builds as its own entry (path-loaded by
// dsh-sandbox-local's win32 chain), inlining the sandbox primitives while
// koffi stays an external native require — the same shape as
// directory-picker-native's worker entry.
const HOST_LIBRARY = {
  entry: { index: 'lib/types/index.js', invariant: 'lib/types/invariant.js', runner: 'lib/types/runner.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARY, options, meta))
