/**
 * `sdkworkDocxPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a document that cannot be
 * shown has several distinct causes, and each one suggests a different next
 * step for the reader.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  title: 'Word 文档',
  loading: '正在解析文档…',
  page: '第 {index} 页',
  pageList: '页面列表',
  pageCanvas: '第 {index} 页预览',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomFit: '适应页面',
  zoomFitWidth: '适宽',
  zoomActual: '实际大小',
  zoomLevel: '缩放 {percent}%',
  pageInput: '跳转到页',
  previous: '上一页',
  next: '下一页',
  unsupportedObject: '嵌入对象，暂不支持预览',
  'failure.notPackage': '这个文件不是可读取的 .docx 文档。',
  'failure.legacy': '旧版 .doc 二进制格式暂不支持预览，请先另存为 .docx。',
  'failure.noDocument': '文件里没有找到可显示的正文。',
  'failure.generic': '预览失败：{message}',
  retry: '重试',
} satisfies Record<string, string>

/** Word-preview dictionary key union. */
export type SdkworkDocxPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  title: 'Word document',
  loading: 'Reading the document…',
  page: 'Page {index}',
  pageList: 'Pages',
  pageCanvas: 'Preview of page {index}',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit page',
  zoomFitWidth: 'Fit width',
  zoomActual: 'Actual size',
  zoomLevel: 'Zoom {percent}%',
  pageInput: 'Go to page',
  previous: 'Previous page',
  next: 'Next page',
  unsupportedObject: 'An embedded object; preview is unavailable',
  'failure.notPackage': 'This file is not a readable .docx document.',
  'failure.legacy': 'The legacy .doc binary format cannot be previewed. Save it as .docx first.',
  'failure.noDocument': 'No displayable body text was found in this file.',
  'failure.generic': 'Preview failed: {message}',
  retry: 'Retry',
} satisfies Record<SdkworkDocxPreviewKey, string>
