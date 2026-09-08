/**
 * App-mode surface plugin, browser half: registers the mode rail shell into
 * the frame's `mode.rail` track (including the bottom-pinned
 * `mode.rail.settings` seat, occupied by ui-settings-general's trigger +
 * panel), the base rail entries into the keyed
 * `mode.rail.entry` seat (later modes come from their own packages), the
 * placeholder pages into the keyed `mode.page` slot (one entry per non-code
 * base mode), the new-session hero's scene switcher into ui-conversation's
 * `conversation.hero.modeSwitch` seat, the staged scene's skill-tag strip
 * into the composer-dock seat below the input card, the hero scene switcher's
 * submission observer (a staged scene navigates when the session's first
 * message lands), and the sidebar-visibility preference row into the settings
 * General section. The active mode state lives in the layout store (the
 * frame's own store — AppFrame reads it for the center column and hands it to
 * the rail as owner props), so this plugin holds no mode state of its own.
 * The persisted sidebar preference is applied as the boot default once the
 * settings scope resolves, and live on row changes.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the mode-rail/mode.page slot declarations (the frame's own
// slots live in ui-layout; the rail's entry seat is this package's contract).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the sessions Context merge (ctx.sessions — the hero scene
// submission observer reads the current session's blank flip from the list)
// and the list snapshot shape.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the settings.general.item slot declaration and the
// ctx.settingsScope Context merge (cross-plugin collaboration via services).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.iam into this program when ui-sdkwork-iam is on the boot graph.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { AuthenticatedModeGate } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { requestAuthenticatedMode } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import { ModeRail } from './ModeRail.tsx'
import { RailEntry, type RailEntryInjected } from './RailEntry.tsx'
import { ModePage, type ModePageInjected } from './ModePage.tsx'
import { HeroModeSwitch, type HeroModeSwitchInjected } from './HeroModeSwitch.tsx'
import { SceneSkillTags, type SceneSkillTagsInjected } from './SceneSkillTags.tsx'
import { createHeroSceneStore } from './hero-scene-store.ts'
import { SidebarSettingsRow, type SidebarSettingsRowInjected } from './SidebarSettingsRow.tsx'
import { createSidebarSettingsRowStore } from './sidebar-settings-store.ts'
import { BASE_MODES, type BaseAppModeId } from './base-modes.ts'
import { en, zh, type AppModeKey } from './locales.ts'
import {
  SIDEBAR_VISIBLE_FIELD, UI_APP_MODES_NAMESPACE, type UiAppModesSettings,
} from '../app-modes-settings.ts'

export type {
  ModePageInjected, ModePageProps,
} from './ModePage.tsx'
export type { ModeRailInjected, ModeRailProps } from './ModeRail.tsx'
export type {
  RailEntryInjected, RailEntryProps,
} from './RailEntry.tsx'
export {
  HeroModeSwitch, HERO_SWITCH_MODES,
} from './HeroModeSwitch.tsx'
export type {
  HeroModeSwitchInjected, HeroModeSwitchProps,
} from './HeroModeSwitch.tsx'
export {
  SceneSkillTags,
} from './SceneSkillTags.tsx'
export type {
  SceneSkillTagsInjected, SceneSkillTagsProps,
} from './SceneSkillTags.tsx'
export {
  createHeroSceneStore,
} from './hero-scene-store.ts'
export type {
  HeroScene, HeroSceneStore,
} from './hero-scene-store.ts'
export {
  SCENE_SKILLS,
} from './scene-skills.ts'
export type {
  SceneSkillTag,
} from './scene-skills.ts'
export { RailTooltip } from './RailTooltip.tsx'
export type { RailTooltipSide } from './RailTooltip.tsx'
export type {
  SidebarSettingsRowInjected, SidebarSettingsRowProps,
} from './SidebarSettingsRow.tsx'
export type { SidebarSettingsRowState } from './sidebar-settings-store.ts'
export type { BaseAppModeId } from './base-modes.ts'
export type { ModeIconProps } from './icons.tsx'
export type { AppModeKey } from './locales.ts'
export type { ModeRailEntryOwnerProps, ModeRailSettingsOwnerProps } from './contract/slots.ts'
export type { UiAppModesSettings } from '../app-modes-settings.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The app-mode surface's copy (rail shell, base entries, pages, settings row). */
    appMode: AppModeKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'appMode'

/** The non-code base modes get placeholder pages; `code` renders the conversation. */
const PLACEHOLDER_MODES: readonly BaseAppModeId[] = ['work', 'document']

/** Services required by the app-mode surface plugin. */
export const inject = ['slots', 'locale', 'settingsScope', 'layout', 'iam', 'sessions']

/**
 * Client plugin body: register the rail shell, the base rail entries, the
 * placeholder pages, the hero scene switcher with its submission observer,
 * and the sidebar-visibility preference row, each once its slot declaration
 * is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-app-modes: dictionaries')

  // The hero scene staging: the pills write it, the submission observer below
  // consumes it. The instance lives with the plugin so a staged pick survives
  // the hero's mount cycles (the first submission unmounts the hero).
  const heroScene = createHeroSceneStore()

  // The mode rail shell: the frame's fixed leftmost track (declared by
  // ui-layout's root entry); the frame hands it the live mode state as owner
  // props, and it renders one keyed entry per mode id plus the
  // bottom-pinned settings seat (occupied by ui-settings-general).
  ctx.slots.inject('mode.rail', () => ctx.slots.register({
    name: 'mode.rail',
    locale: NS,
    children: {
      'mode.rail.entry': { kind: 'keyed', scope: 'root' },
      'mode.rail.settings': { kind: 'single', scope: 'root' },
    },
    inject: (): { authGate: AuthenticatedModeGate } => ({
      authGate: ctx.get('iam') as AuthenticatedModeGate,
    }),
  }, ModeRail))

  // The base entries; later modes register their own from their
  // packages.
  for (const mode of BASE_MODES) {
    ctx.slots.inject('mode.rail.entry', () => ctx.slots.register({
      name: 'mode.rail.entry',
      key: mode,
      locale: NS,
      inject: (): RailEntryInjected => ({ mode }),
    }, RailEntry))
  }

  // One placeholder page per non-code base mode, keyed by the mode id so the
  // frame's keyed dispatch (entryKey = active mode) selects it.
  for (const mode of PLACEHOLDER_MODES) {
    ctx.slots.inject('mode.page', () => ctx.slots.register({
      name: 'mode.page',
      key: mode,
      locale: NS,
      inject: (): ModePageInjected => ({ mode }),
    }, ModePage))
  }

  // The new-session hero's scene switcher: the segmented pill bar under the
  // headline (seat declared by ui-conversation). Clicking a pill stages the
  // scene and keeps the conversation on screen; the submission observer below
  // navigates when the session's first message lands.
  ctx.slots.inject('conversation.hero.modeSwitch', () => ctx.slots.register({
    name: 'conversation.hero.modeSwitch',
    locale: NS,
    inject: (): HeroModeSwitchInjected => ({
      authGate: ctx.get('iam') as AuthenticatedModeGate,
      scene: heroScene,
    }),
  }, HeroModeSwitch))

  // The staged scene's skill tags: the strip docked below the composer card
  // (ui-conversation's composer dock, which the hero card renders too).
  // Clicking a tag lands the same `/name ` literal a '/'-menu pick lands, in
  // replace mode, through the session's public draft write; the strip follows
  // the staged scene and vanishes with the hero once the session engages.
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'hero-scene-skills',
    locale: NS,
    inject: (): SceneSkillTagsInjected => ({ scene: heroScene }),
  }, SceneSkillTags))

  // The submission observer: a non-code staging is consumed when the current
  // session's first message lands (the list row's blank bit flips), and the
  // frame navigates to that scene through the rail's authenticated channel.
  // The flip — not "row is non-blank" — is the trigger, so an already-active
  // session (or another plugin dispatching a prompt into a fresh one) never
  // consumes a staging by accident; a session switch re-arms the baseline.
  ctx.effect(() => {
    // Baseline on the snapshot as it stands at setup: the first notification
    // must be able to carry the flip, not re-arm an empty baseline.
    const initial = ctx.sessions.list.getSnapshot()
    let lastCurrent: SessionListState['current'] = initial.current
    let lastBlank: boolean | undefined
      = initial.current === undefined ? undefined : initial.byId[initial.current]?.blank
    return ctx.sessions.list.subscribe(() => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const current = snapshot.current
      const summary = current === undefined ? undefined : snapshot.byId[current]
      if (current !== lastCurrent) {
        // Another session became current: re-arm on its own blank bit instead
        // of letting the previous session's history trigger a navigation.
        lastCurrent = current
        lastBlank = summary?.blank
        return
      }
      const staged = heroScene.get()
      if (lastBlank === true && summary?.blank === false && staged !== 'code') {
        heroScene.set('code')
        requestAuthenticatedMode(ctx.get('iam') as AuthenticatedModeGate, staged, (mode) => { ctx.layout.setMode(mode) })
      }
      lastBlank = summary?.blank
    })
  }, 'ui-sdkwork-app-modes: hero scene submission observer')

  // The sidebar-visibility preference: mirror the `ui-sdkwork-app-modes` scope into
  // the row store and apply the persisted value as the boot default once the
  // scope resolves (off collapses the sidebar to its control rail; the mode
  // rail stays visible). The row's own switch writes the scope AND applies
  // the frame change immediately.
  const scope = ctx.settingsScope.bind<UiAppModesSettings>({ namespace: UI_APP_MODES_NAMESPACE })
  const rowStore = createSidebarSettingsRowStore()
  let boundActions: BoundActions<typeof rowStore> | undefined
  const syncRow = (): void => {
    const snapshot = scope.getSnapshot()
    boundActions?.sync({
      visible: snapshot.status === 'ready' ? snapshot.value?.sidebarVisible : undefined,
      writable: snapshot.status === 'ready' && snapshot.writable,
      revision: snapshot.revision ?? -1,
    })
  }
  ctx.effect(
    () => scope.subscribe(syncRow),
    'ui-sdkwork-app-modes: sidebar settings row mirror',
  )

  let bootDefaultApplied = false
  ctx.effect(() => scope.subscribe(() => {
    const snapshot = scope.getSnapshot()
    if (snapshot.status !== 'ready' || bootDefaultApplied) return
    bootDefaultApplied = true
    if (snapshot.value?.sidebarVisible === false) ctx.layout.setSidebarVisible(false)
  }), 'ui-sdkwork-app-modes: sidebar visibility boot default')

  const injectRow = (actions: BoundActions<typeof rowStore>): SidebarSettingsRowInjected => {
    boundActions = actions
    // Re-sync at registration so no snapshot is lost between subscription and
    // first render (the store's revision guard drops stale duplicates).
    syncRow()
    return {
      setSidebarVisible: (value) => {
        void scope.set(SIDEBAR_VISIBLE_FIELD, value)
        ctx.layout.setSidebarVisible(value)
      },
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'app-modes-sidebar',
    // After the tray row (order 20); the General column stacks rows.
    order: 30,
    locale: NS,
    store: rowStore,
    inject: injectRow,
  }, SidebarSettingsRow))
}
