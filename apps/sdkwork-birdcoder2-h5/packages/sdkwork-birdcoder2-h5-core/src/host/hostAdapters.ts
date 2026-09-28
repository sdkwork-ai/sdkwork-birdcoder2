/**
 * Host adapter ports of the BirdCoder2 H5 root.
 *
 * The same rule the SDK boundary enforces applies to the platform: a capability
 * package must not import a Capacitor plugin, a Tauri global, a WeChat API, or a
 * browser global (`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` section 9). It
 * receives these typed ports instead, and the composition root decides which
 * implementation to bind for the runtime target.
 *
 * The browser fallback is a real implementation, not a stub: it keeps the same
 * contract so a screen behaves identically under `vite dev` and inside the
 * native shell, with the only difference being durability of the storage.
 */

/** Runtime target the H5 bundle is executing in. */
export type HostPlatformTarget = 'web' | 'capacitor-ios' | 'capacitor-android'

/** Key/value storage that survives a reload where the host can provide it. */
export interface SecureStorageHostAdapter {
  read(key: string): Promise<string | undefined>
  write(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/** Clipboard access, so a pairing code can be handed to the host machine. */
export interface ClipboardHostAdapter {
  writeText(value: string): Promise<void>
}

/** Everything a capability package may ask the platform for. */
export interface HostAdapters {
  readonly platform: HostPlatformTarget
  readonly secureStorage: SecureStorageHostAdapter
  readonly clipboard: ClipboardHostAdapter
}

/**
 * Builds the browser fallback set.
 *
 * `sessionStorage` scope detail: the fallback is process-local memory rather
 * than `localStorage`, because a signed-in owner session must not outlive the
 * tab on a shared device.
 */
export function createBrowserHostAdapters(
  clipboard: ClipboardHostAdapter = createBrowserClipboardAdapter(),
): HostAdapters {
  const memory = new Map<string, string>()
  return {
    platform: 'web',
    secureStorage: {
      read: key => Promise.resolve(memory.get(key)),
      write: (key, value) => {
        memory.set(key, value)
        return Promise.resolve()
      },
      remove: (key) => {
        memory.delete(key)
        return Promise.resolve()
      },
    },
    clipboard,
  }
}

/**
 * Clipboard adapter with an explicit unavailable path.
 *
 * `navigator.clipboard` is absent on an insecure origin, which is exactly how a
 * `http://192.168.x.x` dev server is reached from a phone; a caller then shows
 * the pairing code for manual entry instead of failing silently.
 */
export function createBrowserClipboardAdapter(): ClipboardHostAdapter {
  return {
    writeText: async (value: string) => {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
      if (clipboard === undefined) {
        throw new Error('clipboard is unavailable in this host; display the code for manual entry')
      }
      await clipboard.writeText(value)
    },
  }
}

let boundAdapters: HostAdapters | undefined

/** Binds the adapter set the composition root selected for this runtime target. */
export function bindHostAdapters(adapters: HostAdapters): HostAdapters {
  boundAdapters = adapters
  return adapters
}

/**
 * Returns the bound adapter set.
 *
 * # Errors
 *
 * Throws when the composition root never bound a set, which means the app was
 * mounted without running its bootstrap rather than that the host is unsupported.
 */
export function getHostAdapters(): HostAdapters {
  if (boundAdapters === undefined) {
    throw new Error('host adapters are not bound; the H5 composition root must run before rendering')
  }
  return boundAdapters
}

/** Clears the binding; used by tests so one case cannot leak into the next. */
export function resetHostAdapters(): void {
  boundAdapters = undefined
}
