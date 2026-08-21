/** ui-sdkwork-iam dictionaries: the account mode, its rail entry, and the surfaces. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'page.title': '账号',
  'page.unconfigured.title': '未配置 IAM 服务',
  'page.unconfigured.detail': '请在设置中配置 ui-sdkwork-env 的环境 baseUrl 后使用账号登录。',
  'page.signedOut.title': '登录 SDKWork 账号',
  'page.signedOut.detail': '登录后可同步 SDKWork 身份，并在设置菜单中快速退出。',
  'modal.close': '关闭',
  'account.username': '当前账号',
  'account.id': '用户 ID',
  'account.email': '邮箱',
  'account.signOut': '退出登录',
} satisfies Record<string, string>

/** The ui-sdkwork-iam namespace key union. */
export type UiIamKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'page.title': 'Account',
  'page.unconfigured.title': 'IAM service not configured',
  'page.unconfigured.detail': 'Configure the ui-sdkwork-env environment baseUrl in settings to sign in with your SDKWork account.',
  'page.signedOut.title': 'Sign in with SDKWork',
  'page.signedOut.detail': 'Sign in to carry your SDKWork identity and sign out quickly from the settings menu.',
  'modal.close': 'Close',
  'account.username': 'Current account',
  'account.id': 'User ID',
  'account.email': 'Email',
  'account.signOut': 'Sign out',
} satisfies Record<UiIamKey, string>
