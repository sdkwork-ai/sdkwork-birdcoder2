/** `newChat` namespace dictionaries: the sidebar New Chat entry copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.newChat': '新对话',
  'action.newChat.label': '新对话',
} satisfies Record<string, string>

/** The newChat namespace key union. */
export type NewChatKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'action.newChat': 'New chat',
  'action.newChat.label': 'New chat',
} satisfies Record<NewChatKey, string>
