/**
 * Host adapter contracts of `@sdkwork/birdcoder2-h5-core`.
 *
 * A capability package never touches `Capacitor.*`, `window.__TAURI__`, a WeChat
 * bridge, or a raw browser global (`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md`
 * section 9). It asks the composition root for the bound adapter set instead, so
 * the same screen source runs under `vite dev` on a desktop browser and inside
 * the packaged iOS/Android shell.
 */

export {
  bindHostAdapters,
  createBrowserClipboardAdapter,
  createBrowserHostAdapters,
  getHostAdapters,
  resetHostAdapters,
} from './hostAdapters.ts'
export type {
  ClipboardHostAdapter,
  HostAdapters,
  HostPlatformTarget,
  SecureStorageHostAdapter,
} from './hostAdapters.ts'
