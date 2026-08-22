import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/** Node-only backend: listing and creation primitives over the host filesystem. */
const HOST_LIBRARIES = [
  {
    entry: ['lib/types/index.js', 'lib/types/invariant.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
] as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARIES, options, meta))
