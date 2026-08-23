import { defineConfig } from 'tsdown'

/**
 * The desktop app's own bundle: the ESM main-process half (emitted beside the
 * preload in one `lib/` dir) and the CJS preload artifact — sandboxed preload
 * scripts cannot use ESM, so the preload is the single CJS file Electron loads
 * from `webPreferences.preload`.
 */
export default defineConfig([
  {
    name: 'dsh-desktop',
    entry: 'lib/types/{main,host,ipc,protocol,shutdown,tray,bridge-types,update,desktop-settings}.js',
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    external: ['electron'],
    // `release:gitdependencylocal --inspect [port]` bakes the inspector port
    // into the installer by replacing this reference with a literal ('' when
    // the flag is absent, so packaged builds default to debugging off).
    define: {
      'process.env.DSH_PACKED_INSPECT': JSON.stringify(process.env.DSH_PACKED_INSPECT ?? ''),
    },
  },
  {
    name: 'dsh-desktop-preload',
    entry: { preload: 'lib/types/preload/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    external: ['electron'],
    outputOptions: {
      entryFileNames: 'preload.cjs',
    },
  },
])
