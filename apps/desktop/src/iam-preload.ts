/**
 * Preload half of the SDKWork desktop bridge: exposes the
 * `deepLinks` / `shellOpen` / `about` surface under `window.sdkworkDesktop`
 * (matching `@sdkwork/iam-desktop-auth`'s `SdkworkDesktopBridgeShape`, so the
 * hosted IAM desktop-login runtime is host-agnostic) plus the product-owned
 * `iamSession` slice that mirrors the committed session into `<DSH_HOME>`.
 *
 * `about` is the product's own addition beside the IAM contract: the application
 * menu's About command announces itself there, and a page that mounted after the
 * click takes the pending request once.
 */

import type { IpcRenderer } from 'electron'
import { ABOUT_BRIDGE } from './about-command.ts'
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
  const aboutListeners = new Set<() => void>()
  const forwardAbout = (): void => {
    for (const listener of [...aboutListeners]) listener()
  }
  ipcRenderer.on(ABOUT_BRIDGE.openEvent, forwardAbout)

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
    about: {
      onOpen: (handler: () => void): (() => void) => {
        aboutListeners.add(handler)
        return () => { aboutListeners.delete(handler) }
      },
      takePending: async (): Promise<boolean> => {
        const value: unknown = await ipcRenderer.invoke(ABOUT_BRIDGE.takePending)
        return value === true
      },
      facts: async (): Promise<{ appVersion: string }> => {
        const value: unknown = await ipcRenderer.invoke(ABOUT_BRIDGE.facts)
        const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
        return { appVersion: typeof record.appVersion === 'string' ? record.appVersion : '' }
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
