/**
 * `sdkworkPptxPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a presentation that cannot be
 * shown has several distinct causes, and each one suggests a different next
 * step for the reader.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  title: 'PowerPoint 演示文稿',
  loading: '正在解析演示文稿…',
  slide: '第 {index} 页',
  slideList: '幻灯片列表',
  slideCanvas: '第 {index} 页预览',
  notes: '演讲者备注',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomFit: '适应窗口',
  zoomActual: '实际大小',
  zoomLevel: '缩放 {percent}%',
  previous: '上一页',
  next: '下一页',
  unsupportedFrame: '图表、SmartArt 或媒体对象，暂不支持预览',
  missingImage: '图片格式暂不支持预览（如 EMF、WMF）',
  hiddenSlide: '已隐藏',
  'failure.notPackage': '这个文件不是可读取的 .pptx 演示文稿。',
  'failure.legacy': '旧版 .ppt 二进制格式暂不支持预览，请先另存为 .pptx。',
  'failure.noPresentation': '文件里没有找到可显示的幻灯片。',
  'failure.generic': '预览失败：{message}',
  retry: '重试',
  save: '保存副本',
  notesPlaceholder: '在此输入演讲者备注…',
} satisfies Record<string, string>

/** PowerPoint-preview dictionary key union. */
export type SdkworkPptxPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  title: 'PowerPoint presentation',
  loading: 'Reading the presentation…',
  slide: 'Slide {index}',
  slideList: 'Slides',
  slideCanvas: 'Preview of slide {index}',
  notes: 'Speaker notes',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to window',
  zoomActual: 'Actual size',
  zoomLevel: 'Zoom {percent}%',
  previous: 'Previous slide',
  next: 'Next slide',
  unsupportedFrame: 'A chart, SmartArt, or media object; preview is unavailable',
  missingImage: 'A picture in a format the preview cannot draw, such as EMF or WMF',
  hiddenSlide: 'Hidden',
  'failure.notPackage': 'This file is not a readable .pptx presentation.',
  'failure.legacy': 'The legacy .ppt binary format cannot be previewed. Save it as .pptx first.',
  'failure.noPresentation': 'No displayable slides were found in this file.',
  'failure.generic': 'Preview failed: {message}',
  retry: 'Retry',
  save: 'Save a copy',
  notesPlaceholder: 'Type speaker notes…',
} satisfies Record<SdkworkPptxPreviewKey, string>
