# Agent Note: SDKWork 文档预览共用一套 OOXML 地基

Status: implemented

[English](2026-09-11-sdkwork-document-preview-family-shared-foundation.md) | 中文

## Problem

[PowerPoint 预览](2026-09-10-sdkwork-pptx-preview-ooxml-renderer.zh.md) 最先落地，自带一套 OPC 容器读取、XML 访问、关系解析、主题读取、颜色解析与单位换算。此后本分支想支持的每一种格式——Word、Excel、PDF、图片、视频、音频——都需要其中一部分，于是每一种都逼出同一个选择：

- **把基础能力复制进每个包。** `zip.ts`、`xml.ts`、`rels.ts` 三份并存会让数百行代码三写，并让 `pnpm run duplication` 失败：该门禁以 `minTokens: 60, minLines: 6` 对 `packages` 运行 `jscpd`。
- **从 PowerPoint 包里 import 它们。** 被明令禁止：功能插件不得运行时 import 另一个功能插件的值，也不得为此声明 `dsh.client.external`。共享运行时代码只应放在 `client/store`、`ui-primitives` 或浏览器安全工具包这类窄口径的静态归属中。
- **让每种格式各自重造一遍。** 这是同一次三写，只是名字更差。

客户端包的纯净性门禁把这条边界说得很精确：对既非基线平台模块、又非可内联的 workspace 包做值 import 是构建错误，因为「跨插件值 import 要么内联出一份重复的运行时实例，要么需要一个该包的模块表无法应答的 specifier」。

与此同时，每个预览都在重复同一套主体生命周期——按字节身份解析一次并随 effect 释放、用 `ResizeObserver` 测量舞台、计算适应缩放、以及同样的进度/失败/重试标记——而这套重复至今仍是代码树中最大的克隆族。

## Decision

**基础能力放进一个浏览器安全的库，查看状态共用一份声明，每种格式各自一个插件。**

`@deepseek-ai/dsh-client-sdkwork-office`（`packages/client/sdkwork-office`）负责 OPC 容器读取、带命名空间的 XML 访问、关系解析、含修饰栈的 DrawingML 颜色解析、WordprocessingML 的 `themeTint`/`themeShade` 字节、主题配色与字体、EMU／缇／磅／半点／八分之一磅之间的单位换算、容器种类判定，以及各格式共同的「读取某部件的关系」。

它是库而不是插件，并且**完全没有运行时 import**——`pagedViewStore` 只是交给 `defineStore` 的普通声明，其余共享名字一律通过会被擦除的 `import type` 取得。这正是内联决策诚实的原因：没有需要共享的身份，边界上没有 `instanceof`，没有单例状态。它经 `staticLinked` 预设构建，每个预览包各自内联一份；为此只需在 `packages/client/tsdown.client.ts` 的 `INLINE_SAFE` 中加一行——该白名单的定义正是「客户端包可以内联的契约层与纯折叠：无运行时身份可共享的浏览器安全值」。

**`pagedViewStore` 只覆盖分页查看器。** Word、Excel 与 PowerPoint 的页面形状相同——一个选中索引加一个缩放，按标签页分桶——因此共用这份声明。图片与音频播放器不是分页的，复用它会留下一个无用的 `index` 字段；它们各自声明自己的 store，在出现第二个需要完全相同字段的消费者之前保持插件内私有。

**每个格式插件保持独立。** 每个预览都是自己的 `ui-sdkwork-<格式>-preview` 包，在 `ctx.documentPreviews` 中认领后缀、贡献 keyed `sidebar.right.tab.document` 主体，并拥有自己的渲染器。文档宿主保留标签页、读取、工具栏与查看器菜单；`loading: 'bytes-complete'` 让每个预览都走已有的 `readAll` 通路，因此没有任何预览发起文件读取或新增 RPC。

**识别读字节，绝不读后缀。** 在 PowerPoint 之后落地的每个预览都从文件自身结构判断真实格式，把后缀只当线索：图片预览嗅探签名，因此一个改名为 `.png` 的 JPEG 按 JPEG 渲染；视频预览遍历 ISO box 树、Matroska EBML 树、传输流的 PMT 与 ASF 流属性对象；音频预览读取 ISO 样本描述，这是区分同一个 `.m4a` 里 ALAC 与 AAC 的唯一办法。**识别只是线索，不是判决**——能否解码由平台决定，因此通过识别的文件仍会真正加载一次验证，拒绝会与本预览已从字节读出的容器和编码一起报告，而不是一个光秃秃的数字媒体错误。

**画不出来也要认领。** 每个预览都认领那些它认得却画不出的后缀——旧版 `.ppt`/`.doc`/`.xls`、HEIF、PSD、RAW、AVI、WMV、WMA 等等。不被认领时，这些文件会回退到纯文本读取器并被报告成「非文本文件」，对一个本可展示的文件来说这是错误的解释；被认领后，主体就能说出格式以及读者所需的转换。

## Alternatives considered

**用共享平台模块代替可内联的库。** 把库加进 `PLATFORM_MODULES`、加外壳 seed import 与 Vite alias，能让每个预览共享同一个实例。但这里买不到任何东西：库共享的是函数与普通数据，不是身份，单实例与七份副本行为完全一致，代价却是多出三处接线，以及预览与外壳之间一条同步的模块表依赖。

**把基础能力留在 PowerPoint 包里并 import 它。** 按上文的功能插件规则被否决；模块图无法应答只有一个动态插件提供的 specifier。

**一个预览包内按格式分支。** 包更少，但会把 PowerPoint 样式级联、WordprocessingML 级联与 SpreadsheetML 样式表塞进同一个 bundle，只想看 PDF 的读者要下载全部三者。按格式分包也让每个渲染器的测试、README 与限制说明都限定在它描述的格式内。

**在三种格式之上做一层「Office 文档」抽象。** OOXML 三种格式共享容器与关系，再往上几乎没有共同点：`p:sp` 不是 `w:p`，`w:p` 也不是 `c`。造完它们之后唯一浮现的共享概念，就是分页查看器的状态。

**现在就把主体生命周期抽成共享视图外壳。** 这是剩余的重复，而且真实存在，但它要重构六个已经能跑的包；因此是暂缓而不是否决，克隆报告就是它仍然欠着的证据。

## Consequences

七个预览共用一套地基：PowerPoint、Word、Excel、PDF、图片、视频与音频。此后新增一种「OPC 包 + XML」的格式，意味着写解析器与渲染器，而不是先写容器读取。

每个预览都用真实编码器产出的文件验证，而不是本仓库自己也参与生成的字节：TIFF 用 Pillow，视频与音频容器用 ffmpeg，Office 格式用人工核对过的 OOXML 样本。这些样本查出了自造样本会一并继承的真实缺陷：Theora 画面尺寸读错偏移、传输流 PSI 段起始取自错误字段、ASF 流属性 GUID 字节序写反、一个 8 字节的 `free` box 中断整个 ISO box 遍历，以及把 ALAC 文件报成 AAC。

代价也如实写明，而不是藏起来。PDF 预览的客户端产物约 6.5 MB，因为它内联了 PDF.js worker、字符映射、标准字体与图像解码器，并以头部 banner 携带它们的全部许可证。各预览渲染的都是有明确边界的子集，逐条列在各自包的 README 限制中。

**重复度门禁仍是红的，剩下的就是主体生命周期**：全家桶 23 处克隆、约 341 行，主要是每个 `*Body`／`*Player` 组件都在重复的解析一次 effect、舞台测量、适应缩放计算，以及进度与失败标记。抽成共享的分页查看器外壳是解法；在它存在之前，门禁会如实报告这笔欠账，而不是通过。

本分支工作树中另有两个门禁在本次改动之前就已是红的，且与之无关：`verify-client-ui-i18n` 报告其它 `ui-sdkwork-*` 包中的硬编码字符串，`verify-client-catalog` 因 `packages/client/ui-sidebar/src/` 中残留 `slots.d.ts` 的重复 slot 声明而中止。由于该生成器在收集阶段即中止，其 `slot-catalog.ts` 无法为 `sidebar.right.tab.document` 的新占用者重新生成。
