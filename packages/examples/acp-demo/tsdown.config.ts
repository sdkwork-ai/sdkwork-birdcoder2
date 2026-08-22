import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * acp-agent ships TWO entries: the plugin (`index`) and the CLI `bin` (`bin`),
 * the latter referenced by package.json `bin`/`exports["./bin"]`. The root
 * tsdown builds only `lib/types/index.js`, so this override adds
 * `lib/types/bin.js`. Declarations come from `tsc -b` (dts: false),
 * matching every package.
 */
const HOST_LIBRARY = {
  entry: ['lib/types/index.js', 'lib/types/invariant.js', 'lib/types/bin.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARY, options, meta))
