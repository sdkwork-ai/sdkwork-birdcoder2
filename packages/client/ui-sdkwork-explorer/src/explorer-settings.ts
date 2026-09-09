/** Explorer open-mode preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the SDKWork explorer plugin. */
export const EXPLORER_SETTINGS_NAMESPACE = 'ui-sdkwork-explorer'

/** Field carrying the conversation-file open mode. */
export const FILE_OPEN_FIELD = 'fileOpen'

/** Field carrying the conversation-link open mode. */
export const LINK_OPEN_FIELD = 'linkOpen'

/** Open modes accepted at settings boundaries. */
export const OPEN_MODES = ['builtin', 'native', 'ask'] as const

/** How a conversation file/link gesture resolves. */
export type ExplorerOpenMode = typeof OPEN_MODES[number]

/** Defaults keep the in-app surfaces (right-hand editor/browser tabs). */
export const DEFAULT_FILE_OPEN_MODE: ExplorerOpenMode = 'builtin'
export const DEFAULT_LINK_OPEN_MODE: ExplorerOpenMode = 'builtin'

/** Durable explorer section shared by the Host schema and browser scope. */
export interface ExplorerSettings {
  /** Where clicking a conversation file opens. */
  fileOpen: ExplorerOpenMode
  /** Where clicking a conversation link opens. */
  linkOpen: ExplorerOpenMode
}

/** Durable explorer schema; also the wire envelope the browser scope validates against. */
export const ExplorerSettingsSchema: z<ExplorerSettings> = z.object({
  [FILE_OPEN_FIELD]: z.union([...OPEN_MODES]).default(DEFAULT_FILE_OPEN_MODE),
  [LINK_OPEN_FIELD]: z.union([...OPEN_MODES]).default(DEFAULT_LINK_OPEN_MODE),
})
