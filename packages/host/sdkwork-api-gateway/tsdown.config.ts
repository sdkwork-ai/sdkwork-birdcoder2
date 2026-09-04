import { defineConfig } from 'tsdown'
import { hostOnlyTsdownConfig } from '../../../scripts/tsdown-build-face.ts'

/**
 * Two Node entries: the default plugin (`lib/index.js`, the sdkworkApiFallback
 * + sdkworkEventUpgrades provider) and the desktop carrier node half
 * (`lib/desktop.js`, the desktop-connection plugin the Electron main process
 * mounts). The Client pass builds nothing — the package has no browser face.
 */
const HOST_LIBRARY = {
  entry: ['lib/types/index.js', 'lib/types/desktop.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} as const

export default defineConfig((options, meta) => hostOnlyTsdownConfig(HOST_LIBRARY, options, meta))
