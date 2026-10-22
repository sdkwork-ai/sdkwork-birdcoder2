/** `imConnector` namespace dictionaries: the IM connector rail shortcut copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'entry.label': 'IM链接器',
  'entry.aria': '打开 IM链接器',
} satisfies Record<string, string>

/** The imConnector namespace key union. */
export type ImConnectorKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'entry.label': 'IM connector',
  'entry.aria': 'Open IM connector',
} satisfies Record<ImConnectorKey, string>
