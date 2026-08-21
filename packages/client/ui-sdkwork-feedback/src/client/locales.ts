/** ui-sdkwork-feedback dictionaries: the dialog form, its states, and the dialog shell. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'dialog.title': '意见反馈',
  'dialog.description': '告诉我们你的问题或建议，我们会尽快处理。',
  'dialog.close': '关闭',
  'dialog.unconfigured.title': '未配置反馈服务',
  'dialog.unconfigured.detail': '请在设置中配置 ui-sdkwork-env 的环境 baseUrl 后提交反馈。',
  'dialog.type': '反馈类型',
  'dialog.type.bug': '问题反馈',
  'dialog.type.suggestion': '功能建议',
  'dialog.type.other': '其他',
  'dialog.content': '反馈内容',
  'dialog.content.placeholder': '请描述你遇到的问题或建议…',
  'dialog.content.required': '请填写反馈内容',
  'dialog.content.tooLong': '反馈内容不能超过 4000 字',
  'dialog.contact': '联系方式（选填）',
  'dialog.contact.placeholder': '邮箱或手机号，便于我们联系你',
  'dialog.submit': '提交反馈',
  'dialog.cancel': '取消',
  'dialog.submitting': '提交中…',
  'dialog.success': '感谢你的反馈！',
  'dialog.error': '提交失败，请稍后重试',
  'dialog.error.unauthorized': '请先登录 SDKWork 账号后再提交反馈',
} satisfies Record<string, string>

/** The ui-sdkwork-feedback namespace key union. */
export type UiFeedbackKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'dialog.title': 'Feedback',
  'dialog.description': 'Tell us about a problem or a suggestion — we will follow up.',
  'dialog.close': 'Close',
  'dialog.unconfigured.title': 'Feedback service not configured',
  'dialog.unconfigured.detail': 'Configure the ui-sdkwork-env environment baseUrl in settings to submit feedback.',
  'dialog.type': 'Feedback type',
  'dialog.type.bug': 'Bug report',
  'dialog.type.suggestion': 'Feature suggestion',
  'dialog.type.other': 'Other',
  'dialog.content': 'Feedback content',
  'dialog.content.placeholder': 'Describe the problem or suggestion…',
  'dialog.content.required': 'Please enter feedback content',
  'dialog.content.tooLong': 'Feedback content must be at most 4000 characters',
  'dialog.contact': 'Contact (optional)',
  'dialog.contact.placeholder': 'Email or phone so we can reach you',
  'dialog.submit': 'Submit feedback',
  'dialog.cancel': 'Cancel',
  'dialog.submitting': 'Submitting…',
  'dialog.success': 'Thank you for your feedback!',
  'dialog.error': 'Submission failed, please try again later',
  'dialog.error.unauthorized': 'Sign in with your SDKWork account before submitting feedback',
} satisfies Record<UiFeedbackKey, string>
