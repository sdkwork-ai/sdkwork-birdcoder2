/**
 * `miniProgram` namespace dictionaries for the SDKWork mini-program account
 * plugin.
 *
 * The settings-row frame (title, description, notices, sign-in gate) lives
 * here. The account panel's own copy — columns, form labels, validation, and
 * login-check statuses — belongs to `@sdkwork/iam-pc-mini-program`'s catalog
 * and is never duplicated in this namespace.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'miniProgram'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '小程序账号',
  'section.title': '小程序账号',
  'section.description': '管理微信小程序账号：录入 AppID 与 AppSecret，启停账号并触发登录检测。',
  'section.notConfigured': '尚未配置 SDKWork 网关地址，无法加载小程序账号管理。',
  'section.signInRequired': '登录后可管理小程序账号。',
  'section.signIn': '登录 / 注册',
  'close': '关闭',
} satisfies Record<string, string>

/** The miniProgram namespace key union. */
export type MiniProgramKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Mini Programs',
  'section.title': 'Mini Programs',
  'section.description': 'Manage WeChat mini-program accounts: record the AppID and AppSecret, enable or disable an account, and run its login check.',
  'section.notConfigured': 'The SDKWork gateway origin is not configured; mini-program account management is unavailable.',
  'section.signInRequired': 'Sign in to manage mini-program accounts.',
  'section.signIn': 'Sign in / Register',
  'close': 'Close',
} satisfies Record<MiniProgramKey, string>
