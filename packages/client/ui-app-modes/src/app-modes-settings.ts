/** App-mode surface preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the app-mode surface plugin. */
export const UI_APP_MODES_NAMESPACE = 'ui-app-modes'

/** Field carrying the sidebar-visibility preference in the ui-app-modes section. */
export const SIDEBAR_VISIBLE_FIELD = 'sidebarVisible'

/** Durable app-mode surface section shared by the Host schema and the browser scope. */
export interface UiAppModesSettings {
  /** Whether the sidebar column renders wide content (false collapses it to the control rail). */
  sidebarVisible: boolean
}

/** Durable app-mode surface schema; also the wire envelope the browser scope validates against. */
export const UiAppModesSettingsSchema: z<UiAppModesSettings> = z.object({
  [SIDEBAR_VISIBLE_FIELD]: z.boolean().default(true),
})
