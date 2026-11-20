/**
 * Preload half of the SDKWork desktop bridge: exposes the
 * `deepLinks` / `shellOpen` surface under `window.sdkworkDesktop` (matching
 * `@sdkwork/iam-desktop-auth`'s `SdkworkDesktopBridgeShape`, so the hosted IAM
 * desktop-login runtime is host-agnostic) plus the product-owned
 * `iamSession` slice that mirrors the committed session into `<DSH_HOME>`.
 */

import type { IpcRenderer } from 'electron'
import { SDKWORK_DESKTOP_BRIDGE, SDKWORK_DESKTOP_PRELOAD_KEY } from './iam-deep-links.ts'
import { IAM_LOOPBACK_BRIDGE } from './iam-loopback-protocol.ts'
import { IAM_SESSION_BRIDGE, type IamSessionRecord } from './iam-session-protocol.ts'

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
  const loopbackListeners = new Set<(url: string) => void>()
  const forwardLoopback = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
    if (typeof payload !== 'string') return
    for (const listener of [...loopbackListeners]) listener(payload)
  }
  ipcRenderer.on(IAM_LOOPBACK_BRIDGE.callback, forwardLoopback)

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
    loopbackLogin: {
      start: async (): Promise<{ redirectUri: string }> => {
        const value: unknown = await ipcRenderer.invoke(IAM_LOOPBACK_BRIDGE.start)
        if (typeof value !== 'object' || value === null) throw new Error('loopback login returned no redirect URI')
        const redirectUri = (value as { redirectUri?: unknown }).redirectUri
        if (typeof redirectUri !== 'string' || redirectUri === '') {
          throw new Error('loopback login returned no redirect URI')
        }
        return { redirectUri }
      },
      cancel: async (): Promise<void> => {
        await ipcRenderer.invoke(IAM_LOOPBACK_BRIDGE.cancel)
      },
      onCallback: (handler: (url: string) => void): (() => void) => {
        loopbackListeners.add(handler)
        return () => { loopbackListeners.delete(handler) }
      },
    },
    shellOpen: {
      open: async (url: string): Promise<void> => {
        await ipcRenderer.invoke(SDKWORK_DESKTOP_BRIDGE.shellOpen, url)
      },
    },
    iamSession: {
      read: async (): Promise<IamSessionRecord | null> => {
        const value: unknown = await ipcRenderer.invoke(IAM_SESSION_BRIDGE.read)
        return value === null || typeof value !== 'object' ? null : value as IamSessionRecord
      },
      save: async (session: unknown): Promise<void> => {
        await ipcRenderer.invoke(IAM_SESSION_BRIDGE.save, session)
      },
      clear: async (): Promise<void> => {
        await ipcRenderer.invoke(IAM_SESSION_BRIDGE.clear)
      },
    },
  })
}
