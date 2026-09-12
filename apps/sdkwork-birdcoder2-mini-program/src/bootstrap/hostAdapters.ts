import type { AppRuntime } from './runtime'

export interface MiniProgramHostAdapters {
  readonly platform: 'mp-weixin' | 'mp-alipay' | 'mp-dingtalk'
  readonly storage: { get(key: string): string | undefined; set(key: string, value: string): void; remove(key: string): void }
}

/**
 * Platform adapter boundary. Feature packages consume these ports only and must never call
 * platform globals (`wx.*`, `my.*`) directly. Platform-specific implementations live in
 * `@sdkwork/birdcoder2-mp-host`.
 */
export function registerHostAdapters(_runtime: AppRuntime): MiniProgramHostAdapters {
  const memory = new Map<string, string>()
  return {
    platform: 'mp-weixin',
    storage: {
      get: key => memory.get(key),
      set: (key, value) => {
        memory.set(key, value)
      },
      remove: (key) => {
        memory.delete(key)
      },
    },
  }
}
