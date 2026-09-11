/**
 * `sdkworkPdfPreview` namespace dictionaries.
 *
 * A PDF can fail to open for reasons that call for different actions, so the
 * failure lines are distinct: a password-protected file offers an unlock form,
 * a corrupt one needs a different copy, and a worker that stopped needs a
 * retry.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  title: 'PDF 文档',
  loading: '正在解析 PDF…',
  pageList: '页面',
  page: '第 {index} 页',
  pageCanvas: '第 {index} 页',
  counter: '{index} / {total}',
  pageJump: '页码',
  pageTotal: '/ {total}',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomFit: '适应窗口',
  zoomActual: '实际大小',
  zoomLevel: '缩放 {percent}%',
  rotateLeft: '向左旋转',
  rotateRight: '向右旋转',
  previous: '上一页',
  next: '下一页',
  'failure.notPdf': '这个文件不是可读取的 PDF。',
  'failure.password': '该 PDF 已加密，输入密码即可预览。',
  'failure.passwordIncorrect': '密码不正确，请重试。',
  'failure.worker': 'PDF 渲染进程已停止，请重试。',
  'failure.unsupported': '该 PDF 使用了暂不支持的格式特性，无法预览。',
  'failure.generic': '预览失败：{message}',
  passwordLabel: '密码',
  unlock: '解锁预览',
  cancel: '取消',
  search: '查找',
  matchSummary: '{index} / {total}',
  noMatches: '没有匹配',
  previousMatch: '上一个匹配',
  nextMatch: '下一个匹配',
  retry: '重试',
} satisfies Record<string, string>

/** PDF-preview dictionary key union. */
export type SdkworkPdfPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  title: 'PDF document',
  loading: 'Reading the PDF…',
  pageList: 'Pages',
  page: 'Page {index}',
  pageCanvas: 'Page {index}',
  counter: '{index} of {total}',
  pageJump: 'Page number',
  pageTotal: 'of {total}',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to window',
  zoomActual: 'Actual size',
  zoomLevel: 'Zoom {percent}%',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  previous: 'Previous page',
  next: 'Next page',
  'failure.notPdf': 'This file is not a readable PDF.',
  'failure.password': 'This PDF is encrypted. Enter its password to preview it.',
  'failure.passwordIncorrect': 'That password is not correct. Try again.',
  'failure.worker': 'The PDF renderer stopped. Try again.',
  'failure.unsupported': 'This PDF uses a format feature that is not supported yet.',
  'failure.generic': 'Preview failed: {message}',
  passwordLabel: 'Password',
  unlock: 'Unlock preview',
  cancel: 'Cancel',
  search: 'Find',
  matchSummary: '{index} of {total}',
  noMatches: 'No matches',
  previousMatch: 'Previous match',
  nextMatch: 'Next match',
  retry: 'Retry',
} satisfies Record<SdkworkPdfPreviewKey, string>
