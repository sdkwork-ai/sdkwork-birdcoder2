import { defineConfig } from 'tsdown'

/** Host-only library: the Client tsdown pass has no tsc emit for this package. */
const CLIENT_PASS_SKIP = { entry: '' } as const

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

export default defineConfig(({ env }) => (
  env?.DSH_BUILD_FACE === 'client' ? CLIENT_PASS_SKIP : HOST_LIBRARY
))
