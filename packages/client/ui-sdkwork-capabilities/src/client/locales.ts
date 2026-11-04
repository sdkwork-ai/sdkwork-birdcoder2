/**
 * `composerCapabilities` namespace dictionaries: the three composer capability
 * rows, their popupSelect search copy, MCP and knowledge base row details, and
 * the text one settled pick inserts into the draft.
 *
 * The inserted sentences address the model, but they are also ordinary draft
 * text the user can edit, so they follow the active UI language like every
 * other string here. Skill picks insert the `/name` gesture instead of copy:
 * the Host recognizes that gesture and injects the instruction body.
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The capability rows' labels, picker copy, and inserted directive text. */
    composerCapabilities: ComposerCapabilitiesKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'composerCapabilities'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'label.skills': '技能',
  'label.mcp': 'MCP',
  'label.knowledge': '知识库',
  'description.skills': '选一条技能，把它的调用插入本轮输入',
  'description.mcp': '关联一个 MCP 服务器，让本轮使用它的工具',
  'description.knowledge': '关联一个知识库，把检索到的内容带进本轮输入',
  'search.placeholder': '搜索{topic}…',
  'search.empty.skills': '没有可用的技能',
  'search.empty.mcp': '还没有连接 MCP 服务器',
  'search.empty.knowledge': '没有可用的知识库',
  'search.noResults': '没有匹配项',
  'search.loadFailed': '目录加载失败，请重试',
  'mcp.state.connected': '已连接 · {count} 个工具',
  'mcp.state.connecting': '正在连接',
  'mcp.state.reconnecting': '正在重连',
  'mcp.state.credentials': '等待凭据',
  'mcp.state.closed': '未连接',
  'mcp.state.disabled': '已停用',
  'mcp.state.failed': '不可用',
  'mcp.detail.prefix': '工具前缀 {prefix}',
  'knowledge.group.team': '团队知识库',
  'knowledge.group.personal': '个人知识库',
  'knowledge.detail.documents': '{count} 个文档',
  'insert.mcp': '请使用 MCP 服务器「{name}」的工具（{prefix}）来完成这条输入。',
  'insert.knowledge': '请结合知识库「{name}」回答这条输入。',
  'insert.excerpts': '从知识库「{name}」检索到的相关内容：',
  'notice.knowledgeUnavailable': '知识库暂不可用，无法关联',
  'notice.retrievalUnavailable': '已关联知识库，但这次没有检索到内容',
  'notice.sessionUnavailable': '当前会话已关闭，无法插入',
  'notice.composerBusy': '正在发送，暂时无法插入内容',
} satisfies Record<string, string>

/** The capability namespace key union. */
export type ComposerCapabilitiesKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'label.skills': 'Skill',
  'label.mcp': 'MCP',
  'label.knowledge': 'Knowledge',
  'description.skills': 'Pick a skill and insert its invocation into this message',
  'description.mcp': 'Link an MCP server so this message uses its tools',
  'description.knowledge': 'Link a knowledge base and bring its retrieved passages into this message',
  'search.placeholder': 'Search {topic}…',
  'search.empty.skills': 'No skills available',
  'search.empty.mcp': 'No MCP server is connected yet',
  'search.empty.knowledge': 'No knowledge base available',
  'search.noResults': 'No match',
  'search.loadFailed': 'Catalog loading failed; try again',
  'mcp.state.connected': 'Connected · {count} tools',
  'mcp.state.connecting': 'Connecting',
  'mcp.state.reconnecting': 'Reconnecting',
  'mcp.state.credentials': 'Waiting for credentials',
  'mcp.state.closed': 'Disconnected',
  'mcp.state.disabled': 'Disabled',
  'mcp.state.failed': 'Unavailable',
  'mcp.detail.prefix': 'Tool prefix {prefix}',
  'knowledge.group.team': 'Team knowledge bases',
  'knowledge.group.personal': 'Personal knowledge bases',
  'knowledge.detail.documents': '{count} documents',
  'insert.mcp': 'Use the tools of MCP server "{name}" ({prefix}) for this message.',
  'insert.knowledge': 'Answer this message using the knowledge base "{name}".',
  'insert.excerpts': 'Relevant passages retrieved from the knowledge base "{name}":',
  'notice.knowledgeUnavailable': 'The knowledge base is unavailable and cannot be linked',
  'notice.retrievalUnavailable': 'Knowledge base linked, but nothing was retrieved for this message',
  'notice.sessionUnavailable': 'This conversation is closed; nothing was inserted',
  'notice.composerBusy': 'A message is being sent; try again in a moment',
} satisfies Record<ComposerCapabilitiesKey, string>
