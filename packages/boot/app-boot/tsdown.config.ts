import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Embed Include while keeping Loader external so the built include tree and
 * app host bind to one Loader peer.
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
  deps: {
    alwaysBundle: ['@deepseek-ai/cordis-plugin-include'],
  },
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARY, options, meta))
