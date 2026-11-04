/** App-mode surface preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the app-mode surface plugin. */
export const UI_APP_MODES_NAMESPACE = 'ui-sdkwork-app-modes'

/** Field carrying the sidebar-visibility preference in the ui-sdkwork-app-modes section. */
export const SIDEBAR_VISIBLE_FIELD = 'sidebarVisible'

/** Field carrying the new-session scene-switcher visibility preference. */
export const HERO_SWITCH_VISIBLE_FIELD = 'heroSwitchVisible'

/** Durable app-mode surface section shared by the Host schema and the browser scope. */
export interface UiAppModesSettings {
  /** Whether the sidebar column renders wide content (false collapses it to the control rail). */
  sidebarVisible: boolean
  /** Whether the new-session hero renders the scene-switcher pills. */
  heroSwitchVisible: boolean
}

/**
 * Durable app-mode surface fields, shared by the Host Config (which marks them
 * volatile so the browser scope can read them) and the wire envelope below.
 */
export const UiAppModesSettingsFields = {
  [SIDEBAR_VISIBLE_FIELD]: z.boolean().default(true),
  [HERO_SWITCH_VISIBLE_FIELD]: z.boolean().default(true),
}

/** Durable app-mode surface schema; also the wire envelope the browser scope validates against. */
export const UiAppModesSettingsSchema: z<UiAppModesSettings> = z.object(UiAppModesSettingsFields)
