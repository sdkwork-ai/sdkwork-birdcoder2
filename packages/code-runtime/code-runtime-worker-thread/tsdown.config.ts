import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Build the index and worker as separate single-entry bundles. The sibling `worker.cjs` is loaded
 * by file and must be CommonJS for pkg's VFS Worker hook. A multi-entry build emits an unlisted
 * shared chunk omitted by the package's exact `files` whitelist; separate builds inline it.
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
