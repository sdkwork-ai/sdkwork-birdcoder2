/**
 * The assistant rail cell's copy: the product name the fork's rail carries for
 * the persona-bot surface. "助理" is the label the product asked for, so both
 * the tooltip and the accessible name read it, and the English dictionary keeps
 * the same one-word role ("Assistant").
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'entry.label': '助理',
  'entry.aria': '打开助理',
} satisfies Record<string, string>

/** The `assistant` namespace key union. */
export type AssistantKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'entry.label': 'Assistant',
  'entry.aria': 'Open Assistant',
} satisfies Record<AssistantKey, string>
