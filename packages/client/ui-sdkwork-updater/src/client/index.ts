/**
 * Desktop shell update-UI plugin, browser half: renders the non-intrusive
 * update banner on the frame's floating layer (offer → download progress →
 * restart prompt, with the Phase A release-page fallback), owns the update
 * preferences row in General settings (auto-check, channel, auto-download,
 * manual check), and mirrors the main process's update state machine into the
 * two slot stores. The row lives in the dsh-desktop-app bundle patch only, so
 * the web composition never loads this plugin; the components still guard on
 * the preload surface's presence (fixture mode, accidental composition).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the shell.overlay slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the settings.general.item slot declaration plus the
// ctx.settingsScope Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopUpdates, DesktopUpdateState } from '@deepseek-ai/dsh-client-connection/client'
import { UpdateBanner, type UpdateBannerInjected } from './UpdateBanner.tsx'
import { UpdateSettingsRow, type UpdateSettingsRowInjected } from './UpdateSettingsRow.tsx'
import { createUpdateBannerStore } from './update-banner-store.ts'
import { createUpdateSettingsRowStore } from './update-settings-store.ts'
import {
  AUTO_CHECK_UPDATES_FIELD,
  AUTO_DOWNLOAD_UPDATES_FIELD,
  DESKTOP_SETTINGS_NAMESPACE,
  UPDATE_CHANNEL_FIELD,
  type DesktopUpdateSettings,
} from './update-settings.ts'

export type { UpdateBannerInjected, UpdateBannerProps } from './UpdateBanner.tsx'
export type { UpdateSettingsRowInjected, UpdateSettingsRowProps } from './UpdateSettingsRow.tsx'
export { CHANNEL_LABELS, updateStatusText } from './UpdateSettingsRow.tsx'

/** Required services: the slot registry and the settings transport. */
export const inject = ['slots', 'settingsScope']

/** Read the preload's update surface; undefined in the web composition. */
function updatesOf(): DesktopUpdates | undefined {
  return (globalThis as { desktopBridge?: { updates?: DesktopUpdates } }).desktopBridge?.updates
}

/**
 * Client plugin body: register the update banner and the update preferences
 * row, and mirror the bridge-pushed update state into both slot stores. Target
 * slots are declared by other entries, so each registration rides
 * `slots.inject` on its declaration lifetime (late activation, redeclaration,
 * teardown with the caller's fiber).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const bannerStore = createUpdateBannerStore()
  let boundBannerActions: BoundActions<typeof bannerStore> | undefined
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'update-banner',
    store: bannerStore,
    inject: (actions: BoundActions<typeof bannerStore>): UpdateBannerInjected => {
      boundBannerActions = actions
      return {
        download: () => { updatesOf()?.download() },
        install: () => { updatesOf()?.install() },
        openReleasePage: () => { updatesOf()?.openReleasePage() },
        dismiss: () => { actions.dismiss() },
      }
    },
  }, UpdateBanner))

  // The update preferences row: the browser scope mirrors the host `desktop`
  // namespace; the apply-world change listener is the store's only writer and
  // the row reads via useStore.
  const settingsScope = ctx.settingsScope.bind<DesktopUpdateSettings>({
    namespace: DESKTOP_SETTINGS_NAMESPACE,
  })
  const settingsStore = createUpdateSettingsRowStore()
  let boundSettingsActions: BoundActions<typeof settingsStore> | undefined
  const syncSettings = (): void => {
    const snapshot = settingsScope.getSnapshot()
    boundSettingsActions?.syncSettings({
      autoCheckUpdates: snapshot.status === 'ready' ? snapshot.value?.autoCheckUpdates : undefined,
      updateChannel: snapshot.status === 'ready' ? snapshot.value?.updateChannel : undefined,
      autoDownload: snapshot.status === 'ready' ? snapshot.value?.autoDownload : undefined,
      writable: snapshot.status === 'ready' && snapshot.writable,
      revision: snapshot.revision ?? -1,
    })
  }
  ctx.effect(
    () => settingsScope.subscribe(syncSettings),
    'ui-sdkwork-updater: settings mirror',
  )
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'desktop-update',
    // After the desktop tray row (order 20), before feature rows yet to come.
    order: 30,
    store: settingsStore,
    inject: (actions: BoundActions<typeof settingsStore>): UpdateSettingsRowInjected => {
      boundSettingsActions = actions
      // Re-sync at registration so no snapshot is lost between subscription
      // and first render (the store's revision guard drops stale duplicates).
      syncSettings()
      return {
        setAutoCheck: (value) => { void settingsScope.set(AUTO_CHECK_UPDATES_FIELD, value) },
        setChannel: (value) => { void settingsScope.set(UPDATE_CHANNEL_FIELD, value) },
        setAutoDownload: (value) => { void settingsScope.set(AUTO_DOWNLOAD_UPDATES_FIELD, value) },
        check: () => { updatesOf()?.check() },
      }
    },
  }, UpdateSettingsRow))

  // Bridge state mirror: seed from the state poll, then follow every pushed
  // transition into both stores. Both stores are only written here, so the
  // row and the banner always agree on the phase.
  ctx.effect(() => {
    const updates = updatesOf()
    if (updates === undefined) return () => {}
    const sync = (state: DesktopUpdateState): void => {
      boundBannerActions?.sync(state)
      boundSettingsActions?.syncUpdate(state)
    }
    void updates.getState().then(sync, (error: unknown) => {
      console.error('dsh ui-sdkwork-updater: initial state unavailable:', error)
    })
    return updates.onState(sync)
  }, 'ui-sdkwork-updater: bridge state mirror')
}
