/**
 * `inputHistory` namespace dictionaries: the Input history settings page.
 *
 * Copy here is page chrome only. Cached message text, Session titles, and
 * project paths are user data and render verbatim in whatever language the
 * user wrote them in.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '输入历史',
  'title': '输入历史',
  'intro': '在聊天输入框中按 ↑ / ↓ 浏览最近发送过的消息。记录只保存在本机浏览器中，不会上传到服务端。',
  'keys.hint': '输入框为空或在开头时按 ↑ 选择更早的记录；在结尾时按 ↓ 回到更新的记录，越过最新一条后恢复原草稿。回溯出的记录里，光标仍可正常移动。',

  'enable.label': '启用输入历史',
  'enable.hint': '关闭后不再记录新输入，↑ / ↓ 也不会切换历史。',

  'scope.label': '历史范围',
  'scope.session': '当前会话',
  'scope.project': '当前项目',
  'scope.global': '全部项目',
  'scope.session.hint': '只浏览本会话发送过的消息。',
  'scope.project.hint': '浏览同一项目（工作目录）下所有会话发送过的消息。',
  'scope.global.hint': '浏览本机所有会话发送过的消息。',

  'retention.label': '缓存时长（天）',
  'retention.hint': '超过该时长的记录会自动清除，默认 30 天，可设置 1–365 天。',
  'retention.aria': '缓存时长，单位为天',

  'count': '已缓存 {count} 条记录。',
  'clear.label': '清除历史记录',
  'clear.hint': '只清除本机保存的输入记录，不影响已有会话内容。',
  'disabled.hint': '输入历史已关闭。',
} satisfies Record<string, string>

/** The inputHistory namespace key union. */
export type InputHistoryKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Input history',
  'title': 'Input history',
  'intro': 'Press ↑ / ↓ in the chat input to browse messages you recently sent. History stays in this browser and is never uploaded.',
  'keys.hint': 'Press ↑ while the input is empty or the caret is at its start to pick an older message; press ↓ at the end to walk back, and past the newest message your draft returns. Arrows keep moving the caret inside a recalled entry.',

  'enable.label': 'Enable input history',
  'enable.hint': 'When off, new inputs are not recorded and ↑ / ↓ no longer browse history.',

  'scope.label': 'History scope',
  'scope.session': 'This session',
  'scope.project': 'This project',
  'scope.global': 'All projects',
  'scope.session.hint': 'Browse only messages sent in this session.',
  'scope.project.hint': 'Browse messages from every session in the same project (working directory).',
  'scope.global.hint': 'Browse messages from every session on this browser.',

  'retention.label': 'Keep history for (days)',
  'retention.hint': 'Entries older than this are cleared automatically. The default is 30 days; choose 1–365.',
  'retention.aria': 'Retention in days',

  'count': '{count} entries cached.',
  'clear.label': 'Clear history',
  'clear.hint': 'Clears only the input history stored in this browser; existing conversations are untouched.',
  'disabled.hint': 'Input history is turned off.',
} satisfies Record<InputHistoryKey, string>
