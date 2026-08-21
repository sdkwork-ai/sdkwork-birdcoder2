/** `knowledge` namespace dictionaries: the rail entry and page copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'mode.knowledge': '知识库',
  'mode.knowledge.label': '知识库模式',
  'page.placeholder': '知识库建设中，敬请期待',
  'page.back': '点击左侧「代码」返回工作台',
  'auth.required.title': '登录后使用知识库',
  'auth.required.detail': '知识库需要登录后才能浏览、检索和管理你的内容。',
  'auth.required.action': '登录',
} satisfies Record<string, string>

/** The knowledge namespace key union. */
export type KnowledgeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'mode.knowledge': 'Knowledge',
  'mode.knowledge.label': 'Knowledge mode',
  'page.placeholder': 'The Knowledge Base is under construction.',
  'page.back': 'Click Code in the rail to return to the workbench',
  'auth.required.title': 'Sign in to use Knowledge',
  'auth.required.detail': 'Sign in to browse, search, and manage your knowledge base.',
  'auth.required.action': 'Sign in',
} satisfies Record<KnowledgeKey, string>
