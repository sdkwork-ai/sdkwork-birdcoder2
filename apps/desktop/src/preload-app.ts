/** Shell startup controls, plus the app-window bridge the settings popover owns. */

import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_IPC, type DshDesktopAppBridge, type DshDesktopStartupApi } from './ipc.ts'
import type { DesktopBackendState } from './backend-controller.ts'

const startup: DshDesktopStartupApi = {
  protocolVersion: 1,
  locale: () => ipcRenderer.invoke(DESKTOP_IPC.localeGet) as ReturnType<DshDesktopStartupApi['locale']>,
  backend: {
    status: () => ipcRenderer.invoke(DESKTOP_IPC.backendStatus) as ReturnType<DshDesktopStartupApi['backend']['status']>,
    subscribe(listener) {
      const handle = (_event: Electron.IpcRendererEvent, state: DesktopBackendState): void => { listener(state) }
      ipcRenderer.on(DESKTOP_IPC.backendState, handle)
      return () => { ipcRenderer.off(DESKTOP_IPC.backendState, handle) }
    },
  },
  disablePlugins: () => ipcRenderer.invoke(DESKTOP_IPC.pluginsDisableAll) as Promise<void>,
  restart: () => ipcRenderer.invoke(DESKTOP_IPC.applicationRestart) as Promise<void>,
  resetConfiguration: () => ipcRenderer.invoke(DESKTOP_IPC.configurationReset) as Promise<void>,
}

/**
 * The app-window bridge: the entries the web shell's settings popover owns
 * since the native menu bar is dropped on Windows/Linux (desktop plugins,
 * check-for-updates with the native prompt dialogs, quit).
 */
const appBridge: DshDesktopAppBridge = {
  protocolVersion: 1,
  updates: {
    check: () => { void ipcRenderer.invoke(DESKTOP_IPC.updatesCheckPrompt) },
  },
  plugins: {
    open: () => { void ipcRenderer.invoke(DESKTOP_IPC.pluginsOpen) },
    // The packaged shell owns plugin transactions; main publishes the derived
    // development project path, so an unpackaged run reports itself unusable.
    available: !process.env.DSH_DESKTOP_DEV_PROJECT_DIR,
  },
  quit: () => { void ipcRenderer.invoke(DESKTOP_IPC.appQuit) },
}

contextBridge.exposeInMainWorld('dshDesktop', location.protocol === 'dsh-app:' && location.hostname === 'shell'
  ? startup
  : location.protocol === 'dsh-app:' && location.hostname === 'app'
    ? appBridge
    : { protocolVersion: 1 })
