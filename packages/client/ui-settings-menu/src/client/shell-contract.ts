/**
 * Settings shell contract — the types of the `mode.rail.settings` occupant
 * this package renders. The settings SLOT types (what registrants contribute)
 * stay in ui-settings; this package declares the same seat names the shell it
 * replaces declared, so feature-owned sections and rows mount unchanged.
 */
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-app-modes' SlotMap merge (the 'mode.rail.settings'
// entry) into every program that sees this contract.
import type {} from '@deepseek-ai/dsh-client-ui-app-modes/client'
// Type-only: pulls the settings slot declarations the shell renders into.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { AccountProfile } from './account.ts'
import type { FeedbackProfile } from './feedback.ts'
import type { ThemeMenuSnapshot } from './theme-source.ts'

/** One nav row projected from a settings.section registration's options. */
export interface SettingsSectionRow {
  id: string
  order: number
  label: string
}

/** One ordered onboarding step projected from a slot registration. */
export interface SettingsOnboardingStep {
  id: string
  order: number
}

/**
 * Registrant-private injected share of the settings menu root (assembled in
 * apply): the ledger projections as hooks-compartment sources — the shell
 * reads no locale state and subscribes through the bound hooks — plus the
 * menu's callbacks and update-surface fact.
 */
export type SettingsMenuRootInjected = {
  hooks: {
    /** settings.section ledger projected into ordered nav rows. */
    sections: HostObservable<readonly SettingsSectionRow[]>
    /** settings.onboarding ledger projected into coordinator order. */
    onboardingSteps: HostObservable<readonly SettingsOnboardingStep[]>
    /** theme/change mirror feeding the appearance submenu's selection. */
    theme: HostObservable<ThemeMenuSnapshot>
    /** account profile feeding the username header and account group. */
    account: HostObservable<AccountProfile>
    /** feedback channel profile feeding the menu's feedback row. */
    feedback: HostObservable<FeedbackProfile>
  }
  /** Switch the theme preference (light/dark/system). */
  setTheme: (id: string) => void
  /** Open the feedback surface through the feedback provider (no-op while unavailable). */
  openFeedback: () => void
  /** Start the sign-in flow through the account provider (no-op while anonymous). */
  signIn: () => void
  /** End the session through the account provider. */
  logout: () => void
  /** Ask the desktop updater for a check (no-op without the preload surface). */
  checkForUpdates: () => void
  /** Whether the desktop update surface exists (web compositions hide the row). */
  updatesAvailable: boolean
}

/**
 * Full component props of the settings menu root: the rail owner share (the
 * seat carries no facts — the trigger is always the compact rail form) plus
 * the declared render shares, the menu dictionary seat, and the injected
 * face. No store is registered — menu/dialog open state and active section id
 * are component-local viewing state.
 */
export type SettingsMenuRootComponentProps =
  PropsRuntime<'mode.rail.settings'>
  & PropsRenderSlots<
    | 'settings.trigger'
    | 'settings.header'
    | 'settings.action'
    | 'settings.close'
    | 'settings.section'
    | 'settings.onboarding'
  >
  & PropsLocale<'settings.menu'>
  & InjectFace<SettingsMenuRootInjected>
