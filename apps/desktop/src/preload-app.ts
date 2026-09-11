/** App-window bridge: the settings popover's desktop rows (plugins / updates / quit). */

import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_IPC, type DshDesktopAppBridge } from './ipc.ts'

// The packaged application owns the plugin manager; the development override
// runs unpackaged, mirroring main's developmentProject() gate.
const packaged = !process.env.DSH_DESKTOP_DEV_PROJECT_DIR

const bridge: DshDesktopAppBridge = {
  protocolVersion: 1,
  updates: {
    check: () => { void ipcRenderer.invoke(DESKTOP_IPC.updatesCheckPrompt) },
  },
  plugins: {
    open: () => { void ipcRenderer.invoke(DESKTOP_IPC.pluginsOpen) },
    available: packaged,
  },
  quit: () => { void ipcRenderer.invoke(DESKTOP_IPC.appQuit) },
}

contextBridge.exposeInMainWorld('dshDesktop', bridge)
