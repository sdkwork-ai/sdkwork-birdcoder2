/** `imConversations` namespace dictionaries: the chat rail entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.chat': '聊天',
  'mode.chat.label': '聊天模式',
  'auth.required.title': '登录后使用聊天',
  'auth.required.detail': '登录 SDKWork 账号后即可查看会话、收发消息。',
  'auth.required.action': '登录',
  'state.loading': '正在连接 IM…',
  'state.unavailable': 'IM 暂不可用，请检查网络或环境配置。',
  'state.initFailed': 'IM SDK 初始化失败，请检查 IM 网关地址与会话配置。',
  'state.loadFailed': 'IM 界面加载失败，请检查嵌入包地址与网络连接。',
  'state.notConfigured': 'IM 未配置：缺少嵌入包地址。',
  'state.signInRequired': '登录后才能使用 IM。',
  'state.retry': '重试',
  'empty.title': '选择一个会话',
  'empty.detail': '从左侧会话列表选择联系人，或到通讯录发起新的会话。',
} satisfies Record<string, string>

/** The imConversations namespace key union. */
export type ImConversationsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.chat': 'Chat',
  'mode.chat.label': 'Chat mode',
  'auth.required.title': 'Sign in to chat',
  'auth.required.detail': 'Sign in with your SDKWork account to browse conversations and exchange messages.',
  'auth.required.action': 'Sign in',
  'state.loading': 'Connecting to IM…',
  'state.unavailable': 'IM is unavailable. Check the network or deployment environment.',
  'state.initFailed': 'The IM SDK could not be initialized. Check the IM gateway URL and session configuration.',
  'state.loadFailed': 'The IM interface could not load. Check the embed bundle URL and the network.',
  'state.notConfigured': 'IM is not configured: the embed bundle URL is missing.',
  'state.signInRequired': 'Sign in to use IM.',
  'state.retry': 'Retry',
  'empty.title': 'Select a conversation',
  'empty.detail': 'Pick a contact from the list, or start a new conversation from Contacts.',
} satisfies Record<ImConversationsKey, string>
