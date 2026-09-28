/**
 * Host fleet copy, resolved from the host's own language tag.
 *
 * The fleet screens are reachable before a signed-in owner has any stored
 * preference, so the language comes from the platform rather than from a
 * settings store the capability package would otherwise have to reach into.
 */

/** The three language catalogs every mobile surface ships. */
export type HostsLanguage = 'en' | 'zh-Hans' | 'zh-Hant'

export interface HostsMessages {
  readonly listTitle: string
  readonly listDescription: string
  readonly loading: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly refresh: string
  readonly enroll: string
  readonly enrollTitle: string
  readonly enrollDescription: string
  readonly displayName: string
  readonly displayNamePlaceholder: string
  readonly platform: string
  readonly submit: string
  readonly submitting: string
  readonly codeTitle: string
  readonly codeDescription: string
  readonly copyCode: string
  readonly copiedCode: string
  readonly copyUnavailable: string
  readonly done: string
  readonly rename: string
  readonly renamePrompt: string
  readonly revoke: string
  readonly revokeConfirm: string
  readonly cancel: string
  readonly confirm: string
  readonly authenticationRequired: string
  readonly loadFailed: string
  readonly lastSeen: string
  readonly neverSeen: string
  readonly runtimeVersion: string
  readonly platformWindows: string
  readonly platformLinux: string
  readonly platformMacos: string
  readonly platformDocker: string
  readonly platformCloudSandbox: string
  readonly statusPending: string
  readonly statusOnline: string
  readonly statusOffline: string
  readonly statusDisabled: string
}

const HOSTS_MESSAGES: Record<HostsLanguage, HostsMessages> = {
  en: {
    listTitle: 'Hosts',
    listDescription: 'Machines that run a BirdCoder2 instance for this account.',
    loading: 'Loading hosts...',
    emptyTitle: 'No host yet',
    emptyDescription: 'Enroll a machine to start a conversation on it.',
    refresh: 'Refresh',
    enroll: 'Enroll host',
    enrollTitle: 'Enroll a host',
    enrollDescription: 'Issue a pairing code, then paste it into the host runtime on the target machine.',
    displayName: 'Display name',
    displayNamePlaceholder: 'For example: office workstation',
    platform: 'Platform',
    submit: 'Issue pairing code',
    submitting: 'Issuing...',
    codeTitle: 'Pairing code',
    codeDescription: 'The code is single use and expires. Paste it into the host runtime on the target machine.',
    copyCode: 'Copy code',
    copiedCode: 'Copied',
    copyUnavailable: 'Clipboard is unavailable; enter the code by hand.',
    done: 'Done',
    rename: 'Rename',
    renamePrompt: 'New display name',
    revoke: 'Revoke',
    revokeConfirm: 'Revoke this host? Its running conversations stop being reachable from this account.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    authenticationRequired: 'Your session expired. Sign in again to continue.',
    loadFailed: 'Failed to load hosts.',
    lastSeen: 'Last seen',
    neverSeen: 'never',
    runtimeVersion: 'Runtime',
    platformWindows: 'Windows',
    platformLinux: 'Linux',
    platformMacos: 'macOS',
    platformDocker: 'Docker',
    platformCloudSandbox: 'Cloud sandbox',
    statusPending: 'Pending',
    statusOnline: 'Online',
    statusOffline: 'Offline',
    statusDisabled: 'Disabled',
  },
  'zh-Hans': {
    listTitle: '宿主主机',
    listDescription: '为本账号运行 BirdCoder2 实例的机器。',
    loading: '正在加载宿主主机...',
    emptyTitle: '还没有宿主主机',
    emptyDescription: '先接入一台机器，然后在上面开始对话。',
    refresh: '刷新',
    enroll: '接入宿主',
    enrollTitle: '接入宿主主机',
    enrollDescription: '生成配对码，然后把它粘贴到目标机器的宿主运行时里。',
    displayName: '显示名称',
    displayNamePlaceholder: '例如：办公室工作站',
    platform: '平台',
    submit: '生成配对码',
    submitting: '正在生成...',
    codeTitle: '配对码',
    codeDescription: '配对码仅可使用一次且会过期。请把它粘贴到目标机器的宿主运行时里。',
    copyCode: '复制配对码',
    copiedCode: '已复制',
    copyUnavailable: '剪贴板不可用，请手动输入配对码。',
    done: '完成',
    rename: '重命名',
    renamePrompt: '新的显示名称',
    revoke: '移除',
    revokeConfirm: '确认移除该宿主主机？其上正在运行的对话将无法再从本账号访问。',
    cancel: '取消',
    confirm: '确认',
    authenticationRequired: '登录状态已失效，请重新登录后继续。',
    loadFailed: '加载宿主主机失败。',
    lastSeen: '最近在线',
    neverSeen: '从未',
    runtimeVersion: '运行时',
    platformWindows: 'Windows',
    platformLinux: 'Linux',
    platformMacos: 'macOS',
    platformDocker: 'Docker',
    platformCloudSandbox: '云端沙箱',
    statusPending: '待接入',
    statusOnline: '在线',
    statusOffline: '离线',
    statusDisabled: '已停用',
  },
  'zh-Hant': {
    listTitle: '宿主主機',
    listDescription: '為本帳號執行 BirdCoder2 實例的機器。',
    loading: '正在載入宿主主機...',
    emptyTitle: '尚無宿主主機',
    emptyDescription: '先接入一台機器，然後在上面開始對話。',
    refresh: '重新整理',
    enroll: '接入宿主',
    enrollTitle: '接入宿主主機',
    enrollDescription: '產生配對碼，然後將它貼到目標機器的宿主執行環境中。',
    displayName: '顯示名稱',
    displayNamePlaceholder: '例如：辦公室工作站',
    platform: '平台',
    submit: '產生配對碼',
    submitting: '正在產生...',
    codeTitle: '配對碼',
    codeDescription: '配對碼僅可使用一次且會過期。請將它貼到目標機器的宿主執行環境中。',
    copyCode: '複製配對碼',
    copiedCode: '已複製',
    copyUnavailable: '剪貼簿不可用，請手動輸入配對碼。',
    done: '完成',
    rename: '重新命名',
    renamePrompt: '新的顯示名稱',
    revoke: '移除',
    revokeConfirm: '確認移除該宿主主機？其上正在執行的對話將無法再從本帳號存取。',
    cancel: '取消',
    confirm: '確認',
    authenticationRequired: '登入狀態已失效，請重新登入後繼續。',
    loadFailed: '載入宿主主機失敗。',
    lastSeen: '最近上線',
    neverSeen: '從未',
    runtimeVersion: '執行環境',
    platformWindows: 'Windows',
    platformLinux: 'Linux',
    platformMacos: 'macOS',
    platformDocker: 'Docker',
    platformCloudSandbox: '雲端沙箱',
    statusPending: '待接入',
    statusOnline: '線上',
    statusOffline: '離線',
    statusDisabled: '已停用',
  },
}

/** Narrows a platform language tag to one of the three shipped catalogs. */
export function resolveHostsLanguage(languageTag?: string): HostsLanguage {
  const tag = (languageTag ?? (typeof navigator === 'undefined' ? 'en' : navigator.language)).toLowerCase()
  if (tag.startsWith('zh')) {
    return tag.includes('hant') || tag.includes('tw') || tag.includes('hk') || tag.includes('mo')
      ? 'zh-Hant'
      : 'zh-Hans'
  }
  return 'en'
}

/** Resolves the host fleet catalog for a language tag. */
export function resolveHostsMessages(languageTag?: string): HostsMessages {
  return HOSTS_MESSAGES[resolveHostsLanguage(languageTag)]
}
