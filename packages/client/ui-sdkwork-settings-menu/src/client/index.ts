/**
 * Settings menu + settings shell plugin, browser half: occupies the
 * `mode.rail.settings` seat with the hover settings menu (account header,
 * membership/points group, settings/appearance/help/check-updates group,
 * sign-out footer) and the centered settings panel with section navigation
 * and the onboarding coordinator, declares the settings slots, provides the
 * `ctx.account` anonymous-profile service, and registers the chrome content,
 * the local-document action, and the General section. The composition-level
 * override of ui-settings-general keeps that plugin disabled in the web
 * bundle patch; this package re-declares every settings seat so feature-owned
 * sections, rows, and onboarding steps mount unchanged.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { DesktopUpdates } from '@deepseek-ai/dsh-client-connection/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the settings slot declarations (settings.* SlotMap rows).
// Cross-plugin collaboration goes through the service, never a value import
// (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the rail seat declaration (mode.rail.settings).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.theme + theme/change into this program.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { AccountRuntime } from './account.ts'
import { FeedbackRuntime } from './feedback.ts'
import { createThemeSource } from './theme-source.ts'
import type { SettingsMenuRootInjected, SettingsOnboardingStep, SettingsSectionRow } from './shell-contract.ts'
import { SettingsMenuRoot } from './SettingsMenuRoot.tsx'
import { CloseLabel, HeaderContent, TriggerContent } from './chrome.tsx'
import { GeneralSection } from './GeneralSection.tsx'
import { SettingsDocumentAction } from './SettingsDocumentAction.tsx'
import type { SettingsDocumentActionInjected } from './SettingsDocumentAction.tsx'
import { refreshDocumentIfLoaded, SettingsDocumentStore } from './settings-document-store.ts'
import { en, zh, type SettingsMenuKey } from './locales.ts'

export type {
  CloseLabelProps, HeaderContentProps, TriggerContentProps,
} from './chrome.tsx'
export type {
  GeneralSectionComponentProps,
} from './GeneralSection.tsx'
export type { SettingsDocumentActionInjected, SettingsDocumentActionProps } from './SettingsDocumentAction.tsx'
export type { SettingsDocumentState } from './settings-document-store.ts'
export { SettingsDocumentStore } from './settings-document-store.ts'
export type { SettingsMenuKey } from './locales.ts'
export type { AccountProfile, AccountRuntime, AccountSource } from './account.ts'
export type { FeedbackProfile, FeedbackRuntime, FeedbackSource } from './feedback.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shell chrome + menu copy owned by this package. */
    'settings.menu': SettingsMenuKey
  }
}

/** Dictionary namespace owned by this plugin (shell chrome + menu + General copy). */
const NS = 'settings.menu'

/**
 * Required services (cordis fiber inject). The target slots are declared by
 * other entries whose activation order relative to this one is NOT
 * constrained; registrations depend on their slots through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'theme', 'connection']

/** Read the preload's update surface; undefined in the web composition. */
function updatesOf(): DesktopUpdates | undefined {
  return (globalThis as { desktopBridge?: { updates?: DesktopUpdates } }).desktopBridge?.updates
}

/**
 * Register the `settings.menu` dictionaries, the account service, the chrome
 * content, the General section, and the settings shell, each once its slot
 * declaration is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-settings-menu: dictionaries')

  // Copy freshness is framework-owned: components read the standard `t`
  // seat, and the nav label is a thunk the owner resolves per render — no
  // locale/change re-registration wiring.
  const t = ctx.locale.bind(NS)
  const connection = ctx.get('connection') as ConnectionHandle

  // The account service seam: the anonymous default profile; the ui-sdkwork-iam
  // plugin replaces the source behind the same snapshot face.
  const account = new AccountRuntime()
  ctx.provide('account', account)

  // The feedback channel seam: the unavailable default; the ui-sdkwork-feedback
  // plugin replaces the source behind the same snapshot face.
  const feedback = new FeedbackRuntime()
  ctx.provide('feedback', feedback)

  // Theme mirror for the appearance submenu's selection; the service's own
  // snapshot is the seed, the event keeps it current.
  const themeSource = createThemeSource({
    preference: ctx.theme.getTheme().preference,
    revision: ctx.theme.getTheme().revision,
  })
  ctx.on('theme/change', (snapshot) => {
    themeSource.set({ preference: snapshot.preference, revision: snapshot.revision })
  })

  const documentController = connection.isLoopback
    ? new SettingsDocumentStore(connection.api)
    : undefined
  const documentInjected = documentController === undefined
    ? undefined
    : (() => {
      const useSnapshot = bindSnapshotSelector(documentController.store)
      return (): SettingsDocumentActionInjected => ({ controller: documentController, useSnapshot })
    })()
  ctx.effect(() => ctx.on('connection/reset', () => {
    refreshDocumentIfLoaded(documentController)
  }), 'ui-sdkwork-settings-menu: metadata invalidations')

  // The settings shell: this package occupies the rail-owned hole (the mode
  // rail's bottom-pinned settings seat) and declares the settings slots.
  // Ledger → nav-row projection as an observable
  // source (uSES contract: getSnapshot returns the cached rows until the
  // ledger version moves). Labels may be locale-following thunks, so the cache
  // key includes the locale revision and subscribers ride both sources.
  let rowsVersion = -1
  let rowsRevision = -1
  let rows: readonly SettingsSectionRow[] = []
  let onboardingVersion = -1
  let onboardingSteps: readonly SettingsOnboardingStep[] = []
  const shellInjected = (): SettingsMenuRootInjected => ({
    hooks: {
      sections: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.section')
          const revision = ctx.locale.getSnapshot().revision
          if (version !== rowsVersion || revision !== rowsRevision) {
            rowsVersion = version
            rowsRevision = revision
            rows = ctx.slots.entries('settings.section')
              .map(e => ({
                /* v8 ignore next -- list-slot registration requires id (SlotCore rejects an entry without one) */
                id: e.options.id ?? '',
                order: e.options.order ?? 0,
                label: resolveSlotLabel(e.options.label) ?? '',
              }))
              .sort((a, b) => a.order - b.order)
          }
          return rows
        },
        subscribe: (listener) => {
          const offLedger = ctx.slots.subscribe('settings.section', listener)
          const offLocale = ctx.locale.subscribe(listener)
          return () => {
            offLedger()
            offLocale()
          }
        },
      },
      onboardingSteps: {
        getSnapshot: () => {
          const version = ctx.slots.getVersion('settings.onboarding')
          if (version !== onboardingVersion) {
            onboardingVersion = version
            onboardingSteps = ctx.slots.entries('settings.onboarding')
              .map(e => ({
                /* v8 ignore next -- list-slot registration requires id */
                id: e.options.id ?? '',
                order: e.options.order ?? 0,
              }))
              .sort((a, b) => a.order - b.order)
          }
          return onboardingSteps
        },
        subscribe: listener => ctx.slots.subscribe('settings.onboarding', listener),
      },
      theme: themeSource,
      account,
      feedback,
    },
    setTheme: (id) => { ctx.theme.setTheme(id) },
    signIn: () => { void account.signIn() },
    logout: () => { void account.logout() },
    openFeedback: () => { feedback.open() },
    checkForUpdates: () => { updatesOf()?.check() },
    updatesAvailable: updatesOf() !== undefined,
  })
  ctx.slots.inject('mode.rail.settings', () => ctx.slots.register({
    name: 'mode.rail.settings',
    children: {
      'settings.trigger': { kind: 'single', scope: 'root' },
      'settings.header': { kind: 'single', scope: 'root' },
      'settings.action': { kind: 'list', scope: 'root' },
      'settings.close': { kind: 'single', scope: 'root' },
      'settings.section': { kind: 'list', scope: 'root' },
      'settings.onboarding': { kind: 'list', scope: 'root' },
    },
    inject: shellInjected,
    locale: NS,
  }, SettingsMenuRoot))

  ctx.slots.inject('settings.trigger', () =>
    ctx.slots.register({ name: 'settings.trigger', locale: NS }, TriggerContent))
  ctx.slots.inject('settings.header', () =>
    ctx.slots.register({ name: 'settings.header', locale: NS }, HeaderContent))
  if (documentInjected !== undefined) {
    ctx.slots.inject('settings.action', () => ctx.slots.register({
      name: 'settings.action',
      id: 'open-document',
      order: 0,
      locale: NS,
      inject: documentInjected,
    }, SettingsDocumentAction))
  }
  ctx.slots.inject('settings.close', () =>
    ctx.slots.register({ name: 'settings.close', locale: NS }, CloseLabel))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'general',
    order: 0,
    label: () => t('general.nav'),
    locale: NS,
    children: { 'settings.general.item': { kind: 'list', scope: 'root' } },
  }, GeneralSection))
}
