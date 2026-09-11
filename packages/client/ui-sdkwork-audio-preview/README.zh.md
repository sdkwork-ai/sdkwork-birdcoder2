---
description: "右侧边栏的音频预览：从字节读取容器、编码、标签与封面，以解码出的波形作为定位面，完整播放控制条，以及平台无法解码时给出的可执行解释。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-audio-preview

[English](README.md) | 中文

## 概述

在右侧边栏的文档标签页中绘制音频。本包认领音频容器后缀，从文件本身读取容器、编码、标签与封面，并贡献对应的 keyed 主体，以播放控制条播放它，控制条下方是从字节解码出的波形。声音没有画面，因此读者得到的是文件关于自身所说的一切——封面、标签，以及声音本身的形状。平台拒绝的文件，会与本预览已从字节读出的容器和编码一起解释，而不是一个数字化的媒体错误。

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

- **渲染器元数据** —— `ctx.documentPreviews.register(...)`，id 为 `@deepseek-ai/dsh-client-ui-sdkwork-audio-preview/audio`，`loading: 'bytes-complete'`，认领四十六个后缀。不声明 `priority` 即落在 `extension` 档。
- **主体** —— 同一个 id 在 keyed `sidebar.right.tab.document` 席位上的组件，使用注册时声明的插件内按标签页分桶的播放状态 store。
- **浏览器不解码的容器** —— WMA/ASF、AMR、Monkey's Audio、WavPack、True Audio、Speex、MIDI、DSD、DTS、CAF、Sun/NeXT audio、Creative Voice 与 GSM 被认领，以便主体点名它们以及各自所需的转换，而不是让它们回退到纯文本读取器。

<a id="how-it-renders"></a>
## 渲染方式

`audio/containers.ts` 读取文件自身携带的信息，因为媒体元素只报告一个数字：

| 读取内容 | 来源 |
| :-- | :-- |
| 容器与编码 | 先看签名，再看结构：ISO 样本描述能区分同一个 `.m4a` 里装的是 AAC 还是 ALAC，后缀则区分共用同一个同步字的 AC-3 与 E-AC-3 |
| 标签 | ID3v2.3 与 v2.4 帧——按各帧自己声明的编码解码——外加 ID3v1 尾部兜底、FLAC 与 Ogg 的 Vorbis comment、WAVE 的 RIFF `INFO` 块与 `id3 ` 块、FLAC 图片块，以及 MP4 的 `ilst` atom |
| 封面 | ID3 附加图片帧、FLAC 图片块，或 MP4 的 `covr` atom；类型由图片自身的魔数决定，而不是由容器声称的类型决定，最终转成一个 Blob URL |
| 几何与时长 | FLAC 的流信息、WAVE 的 data 块与其字节率、AIFF 的 common 块、ISO 影片头，以及 MP3 或 MP2 流开头那帧自己的帧头——都从结构读取，而不是假定相邻 |
| 声音本身 | `audio/waveform.ts` 通过 Web Audio API 解码并归约为峰值：这是听众真正用来定位的概览，单纯一根滑杆给不了 |

识别只是线索，不是判决：平台支持的容器里仍可能装着它不支持的编码，因此通过识别的文件会真正加载一次验证，拒绝会与本预览已从字节读出的容器和编码一起报告。两个 Blob URL 都随创建它们的 effect 释放。

<a id="interaction"></a>
## 交互

舞台在文件带封面时先显示封面，然后是标题——制作者写下的标题，否则是文件自身的名字，也就是标签页芯片上的那个名字——接着是艺术家/专辑/年份行、编码与采样率与声道布局的一行摘要，最后是波形。波形是两层：一层绘制声音的 canvas，上面覆盖一个真实 range 输入，透明但可获得焦点，因此指针定位、方向键步进与读屏器播报的滑杆角色都来自平台本身，而不是重新实现的一套。

控制条包含播放与暂停、已播与总时长、前后各十秒的跳转、静音与音量滑杆、播放速度切换与循环开关。舞台本身接管键盘，与视频预览一致：空格或 `k` 播放与暂停，左右方向键前后移动十秒，上下方向键调整音量，`m` 静音，`l` 循环。播放期间会把标题、艺术家、专辑与封面交给系统自身的媒体控制，系统媒体键驱动同一条控制链路。播放速度、音量、静音、循环与播放位置保存在标签页 store 中，回到该标签页会同时恢复设置与位置，关闭标签页则丢弃它们。

平台无法解码的文件保留控制条（播放控制置灰），但把舞台让给一张解释卡片：读出的容器与编码、该转换成什么，以及——当拒绝来自元素本身而非识别阶段时——背后的媒体错误。对任何无法播放的文件，都不绘制波形、封面或标题。下方是容器、编码、采样率、声道、时长、音轨、流派与是否有封面的信息列表。

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user hears here never enters a model request.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>
- **波形需要第二个解码器。** 峰值来自 Web Audio API，而它可能拒绝一个元素正常播放的文件。此时读者失去的是声音的画面，而不是播放器：缺少峰值永远不会导致失败，舞台上也没有别的东西依赖它。
- **浏览器不解码的容器只解释，不播放。** WMA/ASF、AMR、Monkey's Audio、WavPack、True Audio、Speex、MIDI、DSD、DTS、CAF、Sun/NeXT audio、Creative Voice 与 GSM 都会给出容器、编码与所需的转换方式。这是平台限制，不是本包的缺口。
- **容器未声明的几何交给元素。** MP4 采样条目的声道与采样率字段在真实值存放于编码私有描述符的文件里是 0，因此不从容器报告，而不是报告错误的值。解码器同样不被询问：`decodeAudioData` 报告的是音频上下文的采样率而非文件自身的，取它的值就等于报出一个文件并不具备的采样率。
- **MP3 时长交给元素。** 从容器读取需要 Xing/Info 帧头；元素在元数据加载后会给出真实时长，因此这只影响解释路径。
- **不读 APE 标签块与 ASF 内容描述对象。**
- **测试语料只来自一个编码器。** 识别、标签、几何、时长、波形归约与播放器由四个 spec 覆盖，样本为 25 个 ffmpeg 生成文件——12 种容器、两种封面载体、一个中文标题、一个无标签文件；但其中没有来自抓轨软件、流媒体服务或 DAW 的文件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文 —— 点击展开</summary>

`audio/containers.ts` 负责识别、标签与几何，也是唯一命名容器与编码的地方；它不依赖 DOM。`audio/waveform.ts` 负责 Web Audio 解码与 canvas 绘制，在 API 缺失或被拒绝时降级为没有画面。`AudioPlayer.tsx` 负责元素、控制条与两个 Blob URL。`tests/make_samples.py` 用 ffmpeg 重新生成样本。

</details>

**Runtime invariant:** No companion is published. Decoding is delegated to the platform and container parsing is covered by behaviour tests against real encoder output; there is no second independent observation of the same relationship to compare against.
