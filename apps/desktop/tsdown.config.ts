import { defineConfig, type UserConfig } from 'tsdown'

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
  sandboxedPreload('preload', 'lib/types/preload.js'),
  sandboxedPreload('preload-app', 'lib/types/preload-app.js'),
])
