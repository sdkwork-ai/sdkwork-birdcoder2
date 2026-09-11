/**
 * `sdkworkImagePreview` namespace dictionaries.
 *
 * The failure lines distinguish the ways an image fails: a file whose format is
 * known but not decodable here names the format and the way out, a file that
 * cannot be decoded says so plainly, a file that is not an image at all says
 * that, and a file too large to decode safely names its dimensions. Every word
 * a reader sees lives here — the format table states keys, never sentences — so
 * one dictionary serves both languages.
 *
 * The accessible name matches the document owner's own image reader word for
 * word, because a reader reaching an image through either implementation must
 * hear the file named the same way. The title does not: the viewer menu lists
 * every candidate for one suffix, so this renderer's `title` stays distinct
 * from that reader's `Image`/`图片` and a reader can tell the two apart.
 */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  title: '图片查看器',
  loading: '正在解析图片…',
  stage: '图片预览：{name}',
  stageLabel: '图片查看区域',
  zoomIn: '放大',
  zoomOut: '缩小',
  zoomFit: '适应窗口',
  zoomActual: '实际大小',
  zoomLevel: '缩放 {percent}%',
  rotateLeft: '向左旋转',
  rotateRight: '向右旋转',
  rotateReset: '恢复方向',
  metadata: '图片信息',
  dimension: '尺寸',
  format: '格式',
  fileSize: '大小',
  resolution: '分辨率',
  resolutionValue: '{x} × {y} DPI',
  animated: '动图',
  yes: '是',
  no: '否',
  'failure.unsupported': '暂不支持预览 {format} 格式：{reason}',
  'failure.decode': '{format} 文件无法解码，可能已损坏或不完整。',
  'failure.notImage': '这个文件不是可读取的图片。',
  'failure.tooLarge': '这张图片为 {width} × {height}，超出可安全解码的范围，未予打开。',
  'failure.generic': '预览失败：{message}',
  retry: '重试',
  'reason.heif': 'HEIF/HEIC 使用 HEVC 帧内编码，浏览器与预览均无法解码，请另存为 JPEG 或 PNG。',
  'reason.jp2': 'JPEG 2000 的解码器不在浏览器内置能力内，请另存为 JPEG 或 PNG。',
  'reason.jxl': '当前浏览器未启用 JPEG XL 解码，请另存为 JPEG 或 PNG。',
  'reason.psd': 'PSD 是分层编辑格式，其合成结果需由 Photoshop 类软件栅格化后导出。',
  'reason.raw': 'RAW 是相机传感器的原始数据，需要去马赛克才能成像，请导出为 JPEG 或 TIFF。',
  'reason.exr': 'OpenEXR 是浮点高动态范围格式，需要专用解码器。',
  'reason.hdr': 'Radiance HDR 是浮点高动态范围格式，需要专用解码器。',
  'reason.dds': 'DDS 通常是 GPU 压缩纹理，需要按具体压缩块格式解码。',
  'reason.tga': 'Targa 没有可用于识别的文件头签名，无法可靠判断并解码。',
  'reason.eps': 'EPS 是 PostScript 程序而非位图，需要 PostScript 解释器。',
  'reason.pnm': 'Netpbm 的位图变体需要逐格式解析，暂未实现。',
  'reason.icns': 'ICNS 是 macOS 的图标容器，需要专用解码器；请导出为 PNG。',
  'reason.qoi': 'QOI 是无损图像编码格式，浏览器与预览均无内置解码器，请另存为 PNG。',
  'reason.xpm': 'XPM/XBM 是 C 源码形式的位图，需要专用解析器或源码编译，请导出为 PNG。',
} satisfies Record<string, string>

/** Image-preview dictionary key union. */
export type SdkworkImagePreviewKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  title: 'Image viewer',
  loading: 'Reading the image…',
  stage: 'Image preview: {name}',
  stageLabel: 'Image viewing area',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to window',
  zoomActual: 'Actual size',
  zoomLevel: 'Zoom {percent}%',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  rotateReset: 'Reset orientation',
  metadata: 'Image information',
  dimension: 'Dimensions',
  format: 'Format',
  fileSize: 'Size',
  resolution: 'Resolution',
  resolutionValue: '{x} × {y} DPI',
  animated: 'Animated',
  yes: 'Yes',
  no: 'No',
  'failure.unsupported': 'Previewing {format} is not available here: {reason}',
  'failure.decode': 'This {format} file could not be decoded; it may be damaged or incomplete.',
  'failure.notImage': 'This file is not a readable image.',
  'failure.tooLarge': 'This image is {width} × {height}, beyond what can be decoded safely, so it was not opened.',
  'failure.generic': 'Preview failed: {message}',
  retry: 'Retry',
  'reason.heif': 'HEIF/HEIC is HEVC intra-frame coded, which neither the browser nor this preview decodes; save it as JPEG or PNG.',
  'reason.jp2': 'No JPEG 2000 decoder is built into the browser; save it as JPEG or PNG.',
  'reason.jxl': 'JPEG XL decoding is not enabled in this browser; save it as JPEG or PNG.',
  'reason.psd': 'PSD is a layered editing format whose composite must be rasterized by a Photoshop-class application.',
  'reason.raw': 'RAW is a camera sensor dump that needs demosaicing to become an image; export it as JPEG or TIFF.',
  'reason.exr': 'OpenEXR is a floating-point high-dynamic-range format that needs a dedicated decoder.',
  'reason.hdr': 'Radiance HDR is a floating-point high-dynamic-range format that needs a dedicated decoder.',
  'reason.dds': 'DDS is usually a GPU-compressed texture, which needs decoding per block format.',
  'reason.tga': 'Targa has no header signature to identify it by, so it cannot be identified and decoded reliably.',
  'reason.eps': 'EPS is a PostScript program rather than a bitmap, so it needs a PostScript interpreter.',
  'reason.pnm': 'Netpbm\'s bitmap variants need per-format parsing, which is not implemented.',
  'reason.icns': 'ICNS is the macOS icon container, which needs a dedicated decoder; export it as PNG.',
  'reason.qoi': 'QOI is a lossless image codec that neither the browser nor this preview decodes; save it as PNG.',
  'reason.xpm': 'XPM/XBM is a bitmap written as C source, which needs its own parser or a compile step; export it as PNG.',
} satisfies Record<SdkworkImagePreviewKey, string>
