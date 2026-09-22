import { defineConfig, type UserConfig } from 'tsdown'
import { build } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

/**
 * Sandboxed preloads are loaded by Electron's `executeSandboxedPreloadScripts`,
 * whose `require` is a restricted polyfill that resolves only
 * `electron`/`events`/`timers`/`url`. A relative require of a sibling emitted
 * chunk therefore fails at runtime with `module not found: ./ipc-<hash>.cjs`,
 * and the contextBridge bridge is never exposed.
 *
 * Code splitting hoists the `ipc.ts` constants shared by the preload entries
 * into such a sibling chunk, and rolldown rejects `codeSplitting: false` for a
 * multi-input build — so each preload is built as its own single-entry config
 * with splitting disabled, guaranteeing one self-contained file per preload.
 */
function sandboxedPreload(entryName: string, entry: string): UserConfig {
  return {
    entry: { [entryName]: entry },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: { neverBundle: ['electron'] },
    outputOptions: { codeSplitting: false },
  }
}

export default defineConfig([
  {
    entry: ['lib/types/main.js'],
    onSuccess: async () => {
      await build({
        configFile: false,
        plugins: [{
          name: 'desktop-brand-font',
          async generateBundle() {
            for (const name of ['brand-font.css', 'montserrat-regular.woff2', 'montserrat-light.woff2', 'montserrat-medium.woff2', 'Montserrat-OFL.txt']) {
              this.emitFile({
                type: 'asset',
                fileName: name,
                source: await readFile(new URL(`../../packages/client/ui-theme/src/styles/${name}`, import.meta.url)),
              })
            }
          },
        }],
        root: fileURLToPath(new URL('.', import.meta.url)),
        esbuild: { jsx: 'automatic' },
        define: { 'process.env.NODE_ENV': JSON.stringify('production') },
        build: {
          outDir: 'lib/welcome',
          emptyOutDir: true,
          lib: {
            entry: 'src/client/welcome.tsx',
            formats: ['iife'],
            name: 'DesktopWelcome',
            fileName: () => 'welcome.js',
            cssFileName: 'welcome',
          },
        },
      })
    },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: { neverBundle: ['electron'] },
  },
  // Sandboxed Electron preloads run as CommonJS even though the application package is ESM.
  // `preload-app` is the product shell bridge; the welcome, platform-account, mandatory-update
  // and update-dialog preloads isolate their own surfaces from the product bridge, and
  // main.ts loads each `.cjs`.
  sandboxedPreload('preload-app', 'lib/types/preload-app.js'),
  sandboxedPreload('preload-welcome', 'lib/types/preload-welcome.js'),
  sandboxedPreload('preload-platform-account', 'lib/types/preload-platform-account.js'),
  sandboxedPreload('preload-mandatory', 'lib/types/preload-mandatory.js'),
  sandboxedPreload('preload-update-dialog', 'lib/types/preload-update-dialog.js'),
])
