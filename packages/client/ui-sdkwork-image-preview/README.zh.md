---
description: "右侧边栏的图片预览：从字节识别真实格式、按标签页保存的缩放与旋转舞台、图片信息，以及浏览器不支持的 TIFF 自研解码器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-image-preview

[English](README.md) | 中文

## 概述

在右侧边栏的文档标签页中绘制图片。本包在文档注册表中认领一大批图片后缀，从文件起始字节判断真实格式，并贡献对应的 keyed 主体：在可缩放、可旋转的舞台上显示图片，文件信息作为条带列在舞台下方。浏览器自身能解码的格式直接呈现，因而动图得以保留；gzip 压缩的 SVG 解压一次后呈现；TIFF 由本包自行解码，并应用其方向标签；需要本包不具备的解码器的格式，会按名称说明格式，并给出读者所需的转换方式。每一次解码与解压都有上限。

## 目录

- [注册了什么](#what-it-registers)
- [渲染方式](#how-it-renders)
- [交互](#interaction)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册了什么

- **渲染器元数据** —— `ctx.documentPreviews.register(...)`，id 为 `@deepseek-ai/dsh-client-ui-sdkwork-image-preview/image`，`loading: 'bytes-complete'`，认领四十余个后缀。不声明 `priority` 即落在 `extension` 档，优先级高于 builtin 档，因此本预览接管了内置图片读取器同样认领的 8 个后缀，同时该内置读取器仍可在「打开方式」菜单中选到。本渲染器自身名为 `图片查看器`，与内置读取器的 `图片` 相区分：该菜单会列出同一后缀的全部候选，两个同名项会让读者无法分辨。
- **主体** —— 同一个 id 在 keyed `sidebar.right.tab.document` 席位上的组件，使用注册时声明的插件内按标签页分桶的 store。舞台元素即本渲染器的滚动容器。
- **比内置更宽的认领范围。** HEIF、JPEG 2000、JPEG XL、PSD、RAW、OpenEXR、Radiance HDR、DDS、Targa、ICNS、EPS、Netpbm、QOI 与 XPM/XBM 虽然画不出来，但依然被认领。不被认领时它们会回退到纯文本读取器并被报告成「非文本文件」；被认领后，主体就能说出字节真正是什么格式，以及该如何转换。

<a id="how-it-renders"></a>
## 渲染方式

- **由字节决定格式。** 签名匹配优先于后缀，因此一个改名为 `.png` 的 JPEG 会按 JPEG 渲染；签名无法识别时，回退到后缀所声称的格式。SVG 属于文本，因此搜索其根元素而不是按固定偏移匹配，这样即使前面有 XML 声明或注释也能识别。gzip 签名本身就足以判定，因此 `.svgz` 无论叫什么名字都能被认出。
- **只有一条渲染路径。** 无论什么格式，预览最终都得到一个 Blob URL 与浏览器将要绘制的像素尺寸。浏览器能解码的格式直接包装——GIF、APNG 与动图 WebP 因此保留动画；gzip 压缩的 SVG 解压一次；自行解码出的 TIFF 只重编码一次。
- **尺寸按浏览器的绘制结果量取。** 平台支持时，尺寸来自 `createImageBitmap(..., { imageOrientation: 'from-image' })`：这是唯一能反映「方向写在 EXIF 而非像素里」的照片的量法，`naturalWidth` 给出的是存储像素，用错误的一对尺寸计算舞台盒会把图片放到框外。平台无法把某个 blob 转成位图时，回退到用元素量取。
- **自研基线 TIFF 解码器。** TIFF 是扫描仪与印刷流程的产物，而浏览器拒绝解码它。本包自行读取其图像文件目录：支持不压缩、LZW（含 TIFF 的 early-change 码宽）、PackBits 与 Deflate，条带或瓦片，两种字节序，灰度、RGB、调色板、CMYK 与 alpha，每样本 1、2、4、8、16 位，并处理水平差分预测器，最后把文件自带的 `Orientation` 标签应用到解出的像素上。若 TIFF 内嵌 JPEG 预览——基于 TIFF 的 RAW 格式正是如此——则把这些字节直接交给浏览器，其 JPEG 解码远胜重造一遍。
- **所有分配都有上限。** 像素上限为 6400 万，单条带上限为 256 MB：这些数字来自文件本身，因此声称超出的目录会被按名称拒绝，而不是任由它向标签页索要数 GB 内存；Deflate 条带也在这条预算下边读边判，而不是整段缓冲。大图在条带之间让出事件循环，标签页因此保持可响应。
- **一个 URL，只释放一次。** Blob URL 随加载字节的 effect 创建，也随它释放，切换文件或关闭标签页都不会泄漏已解码的图片。

<a id="interaction"></a>
## 交互

工具栏包含说明（像素尺寸、格式与文件大小），按四分之一圈旋转、恢复方向，以及缩放组（缩小、兼作读数的适应窗口、`1:1`、放大）。舞台在图片之下绘制棋盘格，让透明区域可见；文件信息作为条带列在舞台下方：尺寸、格式、大小、文件声明时的分辨率，以及该格式是否支持动图。缩放与旋转按标签页保存，回到该标签页即恢复原有视图。

舞台就是图片自己的视口。`Ctrl`/`Cmd` 加滚轮缩放，并让指针所指的那一点保持在原位；普通滚轮仍然滚动；图片大于舞台后拖拽即平移；双击在「实际大小」与「适应窗口」之间切换；方向键用于平移。舞台获得焦点时，`+`/`=` 放大、`-` 缩小、`0` 回到适应窗口。缩放范围为 5% 至 1600%。

画不出来的文件会自述原因，而不是无声失败：本包没有解码器的格式、以及超出解码预算的图片，都属于文件自身的属性，因此不提供重试（再试一次也改变不了结果）；损坏的文件则保留重试。说明会给出格式名与读者所需的转换方式，并使用读者所用的语言——识别表里只放字典键，从不放句子。

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>
- **没有解码器的格式只解释，不绘制。** HEIF/HEIC、JPEG 2000、JPEG XL、PSD、相机 RAW、OpenEXR、Radiance HDR、DDS、Targa、ICNS、EPS、Netpbm、QOI 与 XPM/XBM 都会给出格式名与读者所需的转换方式。其中 Targa 最麻烦：它没有可用于识别的文件头签名；另两个文本格式则依靠搜索式签名而非固定偏移来识别。
- **TIFF 覆盖范围是基线。** JPEG 压缩条带通过把字节交给浏览器处理，但 CCITT 第 3、4 组传真压缩、旧式 JPEG（compression 6）的标签布局，以及分离（planar）样本平面均未解码；使用它们的文件会报告解码失败，而不是给出一张残缺的图。
- **解码预算是拒绝，而不是降采样。** 超过 6400 万像素、或单条带超过 256 MB 的图片，会按尺寸报告且不予打开；本包没有以较低分辨率解码大图的路径。
- **RAW 只显示其内嵌预览，否则什么都不显示。** 容器里带 JPEG 预览时解码器会找到它；没有时，文件按 RAW 报告，而不做去马赛克。
- **像素本身是内嵌 JPEG 的 TIFF，沿用该 JPEG 自己的方向。** 文件自带的 `Orientation` 标签只应用于本解码器产出的像素；走预览路径时由浏览器应用内嵌 JPEG 携带的 EXIF，本包不会为了强制旋转而重编码它。
- **没有色彩管理。** CMYK 采用朴素换算，内嵌 ICC 配置文件被忽略，因此广色域图片可能偏色。
- **没有编辑面。** 没有裁剪、没有色彩调整，也没有动图逐帧步进；动画只是播放。
- **信息是结构性的，而非内嵌元数据。** 尺寸、格式、大小、DPI 与动图能力都来自文件结构。EXIF 相机字段、IPTC 说明与 XMP 不读取。
- **TIFF 测试样本来自 Pillow。** 测试解码的是独立编码器写出的文件，其中包含一个带 `Orientation` 标签、一个把分辨率写成有理数的样本，但样本库里没有扫描仪或 Photoshop 产出的文件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文 —— 点击展开</summary>

`image/formats.ts` 是识别表，也是唯一命名后缀的地方；对每个画不出来的格式它只声明字典键，因此那里从不出现句子。`image/tiff.ts` 是解码器，除 `DecompressionStream` 外自包含；它的预算与方向变换是最不信任输入的两处。`image/load.ts` 是唯一创建 Blob URL 的地方，因此也是唯一必须释放它的地方，同时也是唯一量取浏览器绘制尺寸的地方。`tests/make_samples.py` 用 Pillow 重新生成样本；改动解码器后请运行它，让测试始终解码真实编码器的输出。

</details>

**Runtime invariant:** No companion is published. Decoding native formats is delegated to the browser and TIFF decoding is covered by behaviour tests against real encoder output; there is no second independent observation of the same relationship to compare against.
