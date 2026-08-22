import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Build the engine and worker separately so each inlines shared modules; a
 * multi-entry build creates an unlisted chunk. The path-loaded worker is
 * CommonJS because pkg's VFS Worker hook compiles it in that format.
 */
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
  {
    entry: ['lib/types/worker.js'],
    outDir: 'lib',
    format: ['cjs'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
] as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARIES, options, meta))
