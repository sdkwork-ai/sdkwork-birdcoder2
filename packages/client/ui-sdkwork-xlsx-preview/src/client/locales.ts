/**
 * `sdkworkXlsxPreview` namespace dictionaries.
 *
 * The failure lines are the point of this file: a workbook that cannot be shown
 * has several distinct causes, and each one suggests a different next step for
 * the reader.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  title: 'Excel 工作簿',
  loading: '正在解析工作簿…',
  sheetList: '工作表',
  sheet: '第 {index} 个工作表',
  sheetCanvas: '工作表 {name}',
  selectAll: '全选',
  formulaBar: '编辑栏',
  nameBox: '名称框',
  emptyCell: '（空）',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomFit: '适应窗口',
  zoomActual: '实际大小',
  zoomLevel: '缩放 {percent}%',
  previous: '上一个工作表',
  next: '下一个工作表',
  unsupportedDrawing: '图表或图形对象，暂不支持预览',
  summaryAverage: '平均值: {value}',
  summaryCount: '计数: {value}',
  summarySum: '求和: {value}',
  'failure.notPackage': '这个文件不是可读取的 .xlsx 工作簿。',
  'failure.legacy': '旧版 .xls 二进制格式暂不支持预览，请先另存为 .xlsx。',
  'failure.noWorkbook': '文件里没有找到可显示的工作表。',
  'failure.generic': '预览失败：{message}',
  retry: '重试',
} satisfies Record<string, string>

/** Excel-preview dictionary key union. */
export type SdkworkXlsxPreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  title: 'Excel workbook',
  loading: 'Reading the workbook…',
  sheetList: 'Sheets',
  sheet: 'Sheet {index}',
  sheetCanvas: 'Sheet {name}',
  selectAll: 'Select all',
  formulaBar: 'Formula bar',
  nameBox: 'Name Box',
  emptyCell: '(empty)',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to window',
  zoomActual: 'Actual size',
  zoomLevel: 'Zoom {percent}%',
  previous: 'Previous sheet',
  next: 'Next sheet',
  unsupportedDrawing: 'A chart or drawing object; preview is unavailable',
  summaryAverage: 'Average: {value}',
  summaryCount: 'Count: {value}',
  summarySum: 'Sum: {value}',
  'failure.notPackage': 'This file is not a readable .xlsx workbook.',
  'failure.legacy': 'The legacy .xls binary format cannot be previewed. Save it as .xlsx first.',
  'failure.noWorkbook': 'No displayable sheet was found in this file.',
  'failure.generic': 'Preview failed: {message}',
  retry: 'Retry',
} satisfies Record<SdkworkXlsxPreviewKey, string>
