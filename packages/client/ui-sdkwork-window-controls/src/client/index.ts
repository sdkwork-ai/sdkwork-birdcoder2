/**
 * Desktop shell chrome plugin, browser half: contributes the custom
 * minimize/maximize/close cluster to the frame-wide shell overlay, reserves
 * its footprint in the Session header utilities (right of Session log), routes
 * tray-driven navigation (open/new session from the system tray menu) into the
 * sessions and workspaces services, and owns the close-to-tray preference row
 * in General settings. The row lives in the dsh-desktop-app bundle patch only,
 * so the web composition never loads this plugin; the components still guard
 * on the preload surface's presence (fixture mode, accidental composition).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pull the conversation + layout SlotMap merges that declare the
// two target slots (declaration stays with those packages).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the settings.general.item slot declaration plus the
// ctx.settingsScope Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopBridge, DesktopWindowControls, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import {
  FloatingWindowControls, WindowControls, platformOf,
  type WindowControlsInjected,
} from './WindowControls.tsx'
import {
  CLOSE_TO_TRAY_FIELD, DESKTOP_SETTINGS_NAMESPACE, type DesktopTraySettings,
} from './tray-settings.ts'
import { createTraySettingsRowStore } from './tray-settings-store.ts'
import { TraySettingsRow, type TraySettingsRowInjected } from './TraySettingsRow.tsx'

export type {
  FloatingWindowControlsProps, WindowControlsInjected, WindowControlsPlatform, WindowControlsProps,
} from './WindowControls.tsx'
export type { TraySettingsRowInjected, TraySettingsRowProps } from './TraySettingsRow.tsx'

/** Required services: the slot registry, navigation services, and the settings transport. */
export const inject = ['slots', 'sessions', 'workspaces', 'settingsScope']

/** Read the preload's window surface; undefined in the web composition. */
function windowControlsOf(): DesktopWindowControls | undefined {
  return (globalThis as { desktopBridge?: { windowControls?: DesktopWindowControls } })
    .desktopBridge?.windowControls
}

/** Read the full preload surface (tray navigation included); undefined on the web. */
function desktopBridgeOf(): DesktopBridge | undefined {
  return (globalThis as { desktopBridge?: DesktopBridge }).desktopBridge
}

/**
 * Client plugin body: register the header spacer and overlay control cluster,
 * wire tray navigation into the sessions/workspaces services, and register
 * the close-to-tray preference row. Target slots are declared by other
 * entries, so each registration rides `slots.inject` on its declaration
 * lifetime (late activation, redeclaration, teardown with the caller's fiber).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const injectWindowControls = (): WindowControlsInjected => ({
    windowControls: windowControlsOf(),
    platform: platformOf(),
  })
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'window-controls',
    // Right of the Session-log utility: the shipped utility registers at the
    // default order 0, this positive order keeps the cluster the last entry.
    order: 100,
    inject: injectWindowControls,
  }, WindowControls))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'window-controls-floating',
    inject: injectWindowControls,
  }, FloatingWindowControls))

  // Tray-driven navigation: the desktop shell's tray menu lists the whole host
  // corpus, which can outrun the renderer's list mirror (a session created by
  // another harness process), so an unknown id repulls the baseline before
  // opening. "New session" rides the shared New Session action.
  const openTraySession = async (sessionId: SessionId): Promise<void> => {
    const sessions = ctx.sessions
    if (!sessions.list.getSnapshot().ids.includes(sessionId)) {
      try {
        await sessions.refresh()
      } catch (error) {
        console.warn('[window-controls] tray session refresh failed:', error)
      }
    }
    try {
      sessions.open(sessionId)
    } catch (error) {
      console.warn(`[window-controls] tray session ${sessionId} unavailable:`, error)
    }
  }
  ctx.effect(() => {
    const bridge = desktopBridgeOf()
    const disposers: (() => void)[] = []
    if (bridge?.onOpenSession !== undefined) {
      disposers.push(bridge.onOpenSession((sessionId) => {
        void openTraySession(sessionId)
      }))
    }
    if (bridge?.onNewSession !== undefined) {
      disposers.push(bridge.onNewSession(() => {
        ctx.workspaces.startSession()
      }))
    }
    return () => { for (const dispose of disposers) dispose() }
  }, 'window-controls: tray navigation')

  // The close-to-tray preference row: the browser scope mirrors the host
  // `desktop` namespace; the apply-world change listener is the store's only
  // writer and the row reads via useStore.
  const traySettingsScope = ctx.settingsScope.bind<DesktopTraySettings>({
    namespace: DESKTOP_SETTINGS_NAMESPACE,
  })
  const traySettingsStore = createTraySettingsRowStore()
  let boundActions: BoundActions<typeof traySettingsStore> | undefined
  const syncTraySettings = (): void => {
    const snapshot = traySettingsScope.getSnapshot()
    boundActions?.sync({
      enabled: snapshot.status === 'ready' ? snapshot.value?.closeToTray : undefined,
      writable: snapshot.status === 'ready' && snapshot.writable,
      revision: snapshot.revision ?? -1,
    })
  }
  ctx.effect(
    () => traySettingsScope.subscribe(syncTraySettings),
    'window-controls: tray settings mirror',
  )
  const injectTraySettings = (actions: BoundActions<typeof traySettingsStore>): TraySettingsRowInjected => {
    boundActions = actions
    // Re-sync at registration so no snapshot is lost between subscription and
    // first render (the store's revision guard drops stale duplicates).
    syncTraySettings()
    return {
      setCloseToTray: (value) => { void traySettingsScope.set(CLOSE_TO_TRAY_FIELD, value) },
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'desktop-tray',
    // After the Appearance row (order 10), before feature rows yet to come.
    order: 20,
    store: traySettingsStore,
    inject: injectTraySettings,
  }, TraySettingsRow))
}
