/**
 * Preload half of the SDKWork desktop bridge: exposes exactly the
 * `deepLinks` / `shellOpen` surface under `window.sdkworkDesktop`, matching
 * `@sdkwork/iam-desktop-auth`'s `SdkworkDesktopBridgeShape` so the hosted IAM
 * desktop-login runtime is host-agnostic.
 */

import type { IpcRenderer } from 'electron'
import { SDKWORK_DESKTOP_BRIDGE, SDKWORK_DESKTOP_PRELOAD_KEY } from './iam-deep-links.ts'

/** The context bridge slice this module needs. */
export interface IamPreloadContextBridge {
  exposeInMainWorld(key: string, value: unknown): void
}

/**
 * Expose the SDKWork desktop bridge to the application renderer.
 * @param contextBridge - Electron context bridge.
 * @param ipcRenderer - Electron renderer IPC.
 */
export function exposeSdkworkDesktopBridge(contextBridge: IamPreloadContextBridge, ipcRenderer: IpcRenderer): void {
  const listeners = new Set<(url: string) => void>()
  const forward = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
    if (typeof payload !== 'string') return
    for (const listener of [...listeners]) listener(payload)
  }
  ipcRenderer.on(SDKWORK_DESKTOP_BRIDGE.deepLinksOpenEvent, forward)

  contextBridge.exposeInMainWorld(SDKWORK_DESKTOP_PRELOAD_KEY, {
    deepLinks: {
      getInitialUrl: async (): Promise<string | null> => {
        const value: unknown = await ipcRenderer.invoke(SDKWORK_DESKTOP_BRIDGE.deepLinksGetInitialUrl)
        return typeof value === 'string' ? value : null
      },
      onOpenUrl: (handler: (url: string) => void): (() => void) => {
        listeners.add(handler)
        return () => { listeners.delete(handler) }
      },
    },
    shellOpen: {
      open: async (url: string): Promise<void> => {
        await ipcRenderer.invoke(SDKWORK_DESKTOP_BRIDGE.shellOpen, url)
      },
    },
  })
}
