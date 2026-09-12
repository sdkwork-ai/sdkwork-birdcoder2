import type { AppRuntime } from './runtime'

export interface HostAdapters {
  readonly platform: 'web' | 'capacitor-ios' | 'capacitor-android'
  readonly secureStorage: {
    read(key: string): Promise<string | undefined>
    write(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
  }
  readonly clipboard: { writeText(value: string): Promise<void> }
}

/**
 * Host adapter registration. Feature packages consume these typed ports only and must never
 * import Capacitor plugins, WeChat globals, or browser globals directly
 * (APP_H5_ARCHITECTURE_SPEC.md §9). The web fallback keeps the same contract.
 */
export function registerHostAdapters(_runtime: AppRuntime): HostAdapters {
  const memory = new Map<string, string>()
  return {
    platform: 'web',
    secureStorage: {
      read: async key => memory.get(key),
      write: async (key, value) => {
        memory.set(key, value)
      },
      remove: async (key) => {
        memory.delete(key)
      },
    },
    clipboard: { writeText: async () => undefined },
  }
}
