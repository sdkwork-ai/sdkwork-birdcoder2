/** `assistant` namespace dictionaries: the rail entry's tooltip and accessible name. */

/**
 * Simplified Chinese dictionary (the key-set source of truth). The product
 * names this surface 助理, and the tooltip and the accessible name must read
 * the same word: the entry is an icon-only control, so its tooltip is the
 * only place a sighted user learns the name.
 */
export const zh = {
  'mode.assistant': '助理',
  'mode.assistant.label': '助理',
} satisfies Record<string, string>

/** The assistant namespace key union. */
export type AssistantKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.assistant': 'Assistant',
  'mode.assistant.label': 'Assistant',
} satisfies Record<AssistantKey, string>
