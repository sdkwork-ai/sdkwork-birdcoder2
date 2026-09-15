import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Embed Include while keeping Loader external so the built include tree and
 * app host bind to one Loader peer.
 */
const HOST_LIBRARY = {
  entry: ['lib/types/index.js'],
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

/**
 * Worker build banners import this entry before bundled business code, so each
 * Worker installs the profile-resolution generation in its own isolate. The
 * bundle carries no static package imports beyond its bundled `resolve.exports`.
 */
const WORKER_BOOTSTRAP_LIBRARY = {
  entry: { 'worker/profile-resolution-bootstrap': 'lib/types/profile-resolution/worker-bootstrap.js' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    alwaysBundle: ['resolve.exports'],
  },
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig([HOST_LIBRARY, WORKER_BOOTSTRAP_LIBRARY], options, meta))
