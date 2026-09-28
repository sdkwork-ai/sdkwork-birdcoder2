/**
 * Agent conversation copy, resolved from the host's own language tag.
 *
 * Same reasoning as the host fleet catalog: the conversation can be reached
 * before any stored preference exists, so the platform language decides.
 */

/** The three language catalogs every mobile surface ships. */
export type AgentChatLanguage = 'en' | 'zh-Hans' | 'zh-Hant'

export interface AgentChatMessages {
  readonly chatTitle: string
  readonly chatDescription: string
  readonly noHostTitle: string
  readonly noHostDescription: string
  readonly goToHosts: string
  readonly hostLabel: string
  readonly loading: string
  readonly emptyHistory: string
  readonly inputPlaceholder: string
  readonly send: string
  readonly sending: string
  readonly cancel: string
  readonly cancelling: string
  readonly retry: string
  readonly streaming: string
  readonly turnFailed: string
  readonly turnCancelled: string
  readonly authenticationRequired: string
  readonly loadFailed: string
  readonly sendFailed: string
  readonly operationFailed: string
  readonly sessionListTitle: string
  readonly sessionListDescription: string
  readonly newSession: string
  readonly newSessionTitle: string
  readonly noSessions: string
  readonly open: string
  readonly renameSession: string
  readonly renamePrompt: string
  readonly deleteSession: string
  readonly deleteConfirm: string
  readonly confirm: string
  readonly lastActivity: string
}

const AGENT_CHAT_MESSAGES: Record<AgentChatLanguage, AgentChatMessages> = {
  en: {
    chatTitle: 'Chat',
    chatDescription: 'Talk to the BirdCoder agent running on an enrolled host.',
    noHostTitle: 'No host enrolled',
    noHostDescription: 'A conversation runs on a host, so enroll one first.',
    goToHosts: 'Go to hosts',
    hostLabel: 'Host',
    loading: 'Loading conversation...',
    emptyHistory: 'No messages yet. Send the first one.',
    inputPlaceholder: 'Message BirdCoder',
    send: 'Send',
    sending: 'Sending...',
    cancel: 'Stop',
    cancelling: 'Stopping...',
    retry: 'Retry',
    streaming: 'The agent is replying...',
    turnFailed: 'The agent failed this turn.',
    turnCancelled: 'This turn was stopped.',
    authenticationRequired: 'Your session expired. Sign in again to continue.',
    loadFailed: 'Failed to load the conversation.',
    sendFailed: 'Failed to send the message.',
    operationFailed: 'That action could not be completed.',
    sessionListTitle: 'Sessions',
    sessionListDescription: 'Conversations you have started on your hosts.',
    newSession: 'New session',
    newSessionTitle: 'New conversation',
    noSessions: 'No conversation yet.',
    open: 'Open',
    renameSession: 'Rename',
    renamePrompt: 'New title',
    deleteSession: 'Delete',
    deleteConfirm: 'Delete this conversation? Its transcript stops being reachable from this account.',
    confirm: 'Confirm',
    lastActivity: 'Last activity',
  },
  'zh-Hans': {
    chatTitle: '对话',
    chatDescription: '与运行在已接入宿主上的 BirdCoder 智能体对话。',
    noHostTitle: '还没有接入宿主',
    noHostDescription: '对话要跑在宿主上，请先接入一台宿主主机。',
    goToHosts: '去接入宿主',
    hostLabel: '宿主',
    loading: '正在加载对话...',
    emptyHistory: '暂无消息，发送第一条吧。',
    inputPlaceholder: '给 BirdCoder 发送消息',
    send: '发送',
    sending: '正在发送...',
    cancel: '停止',
    cancelling: '正在停止...',
    retry: '重试',
    streaming: '智能体正在回复...',
    turnFailed: '本轮执行失败。',
    turnCancelled: '本轮已停止。',
    authenticationRequired: '登录状态已失效，请重新登录后继续。',
    loadFailed: '加载对话失败。',
    sendFailed: '发送消息失败。',
    operationFailed: '操作未能完成。',
    sessionListTitle: '会话',
    sessionListDescription: '你在各宿主上发起的对话。',
    newSession: '新建会话',
    newSessionTitle: '新建对话',
    noSessions: '还没有对话。',
    open: '打开',
    renameSession: '重命名',
    renamePrompt: '新的标题',
    deleteSession: '删除',
    deleteConfirm: '确认删除该对话？其对话记录将无法再从本账号访问。',
    confirm: '确认',
    lastActivity: '最近活动',
  },
  'zh-Hant': {
    chatTitle: '對話',
    chatDescription: '與執行在已接入宿主上的 BirdCoder 智慧代理對話。',
    noHostTitle: '尚無接入宿主',
    noHostDescription: '對話要執行在宿主上，請先接入一台宿主主機。',
    goToHosts: '去接入宿主',
    hostLabel: '宿主',
    loading: '正在載入對話...',
    emptyHistory: '尚無訊息，傳送第一則吧。',
    inputPlaceholder: '給 BirdCoder 傳送訊息',
    send: '傳送',
    sending: '正在傳送...',
    cancel: '停止',
    cancelling: '正在停止...',
    retry: '重試',
    streaming: '智慧代理正在回覆...',
    turnFailed: '本輪執行失敗。',
    turnCancelled: '本輪已停止。',
    authenticationRequired: '登入狀態已失效，請重新登入後繼續。',
    loadFailed: '載入對話失敗。',
    sendFailed: '傳送訊息失敗。',
    operationFailed: '操作未能完成。',
    sessionListTitle: '工作階段',
    sessionListDescription: '你在各宿主上發起的對話。',
    newSession: '新增工作階段',
    newSessionTitle: '新增對話',
    noSessions: '尚無對話。',
    open: '開啟',
    renameSession: '重新命名',
    renamePrompt: '新的標題',
    deleteSession: '刪除',
    deleteConfirm: '確認刪除該對話？其對話記錄將無法再從本帳號存取。',
    confirm: '確認',
    lastActivity: '最近活動',
  },
}

/** Narrows a platform language tag to one of the three shipped catalogs. */
export function resolveAgentChatLanguage(languageTag?: string): AgentChatLanguage {
  const tag = (languageTag ?? (typeof navigator === 'undefined' ? 'en' : navigator.language)).toLowerCase()
  if (tag.startsWith('zh')) {
    return tag.includes('hant') || tag.includes('tw') || tag.includes('hk') || tag.includes('mo')
      ? 'zh-Hant'
      : 'zh-Hans'
  }
  return 'en'
}

/** Resolves the agent conversation catalog for a language tag. */
export function resolveAgentChatMessages(languageTag?: string): AgentChatMessages {
  return AGENT_CHAT_MESSAGES[resolveAgentChatLanguage(languageTag)]
}

/** What a failure banner shows: the localized sentence, then the platform detail. */
export interface FailureBanner {
  readonly sentence: string
  readonly detail: string | null
}

/**
 * Splits a failure into the sentence a screen shows and the detail under it.
 *
 * Two faults motivated this. The banner printed the transport's own English
 * message inside an otherwise translated shell; and `loadFailed` /
 * `operationFailed` existed in all three catalogs but nothing reached them. The
 * screens merge a provider read and a user-triggered action into one banner, so
 * `isAction` is what distinguishes them — the caller knows which one it holds,
 * and the failure itself does not.
 *
 * The platform message is kept as `detail` rather than dropped: it carries the
 * trace id a support report is matched against.
 */
export function resolveFailureBanner(
  messages: AgentChatMessages,
  failure: { readonly code: string; readonly message: string },
  isAction: boolean,
): FailureBanner {
  if (failure.code === 'authentication') {
    return { sentence: messages.authenticationRequired, detail: null }
  }
  return {
    sentence: isAction ? messages.operationFailed : messages.loadFailed,
    detail: failure.message,
  }
}
