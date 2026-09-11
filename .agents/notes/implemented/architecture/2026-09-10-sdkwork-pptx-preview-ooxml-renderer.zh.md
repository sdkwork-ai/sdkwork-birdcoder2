# Agent Note: PowerPoint 演示文稿在文档标签页中渲染

Status: implemented

[English](2026-09-10-sdkwork-pptx-preview-ooxml-renderer.md) | 中文

## Problem

在右侧 Sidebar 打开一个 `.pptx` 文件时，界面显示「非文本文件，暂时无法预览」。没有任何文档渲染器认领该后缀，于是 [Document preview](2026-09-08-document-preview-operations.zh.md) 回退到纯文本读取器；后者的 `text-pages` 模式会向 Host 请求对 ZIP 容器做按行文本读取，Host 以 `workspace-file/not-text` 拒绝。文件本可展示，提示却说它不行。

这条缝早已存在——一个 `DocumentPreviewDefinition` 加一个 keyed 主体——但当时没有许可宽松、离线、纯客户端的渲染器可以挂在后面。可选项要么需要服务端（OnlyOffice、Collabora），要么需要商业许可与数十兆 WASM（LibreOffice/ZetaOffice），要么需要文件位于公网 URL（微软的查看器），要么只是局部 DOM 渲染器——没有 React 组件，且许可证在本环境无法核实。

## Decision

本 fork 自带渲染器：`@deepseek-ai/dsh-client-ui-sdkwork-pptx-preview`，一个仅浏览器端的客户端插件，它是「文档实现」而不是 Sidebar tab 类型。它注册一个 `DocumentPreviewDefinition`（`pptx`、`pptm`、`ppsx`、`potx`、`ppt`；`loading: 'bytes-complete'`；不声明 `priority`，因此留在优先级高于 builtin 的 `extension` 档），并在 `sidebar.right.tab.document` 中注册对应的 keyed 主体。标签页、读取、工具栏与查看器菜单仍归文档宿主所有；`bytes-complete` 让它走已有的 `readAll` 通路，因此本包不发起任何文件读取，也不新增 RPC。

解析是从整包字节到渲染模型的纯函数，渲染则是该模型的纯投影：

- OPC 容器读取、XML 访问、关系解析、主题读取、颜色解析与单位换算位于共享的[文档预览地基](2026-09-11-sdkwork-document-preview-family-shared-foundation.zh.md) `@deepseek-ai/dsh-client-sdkwork-office` 中；本包 import 它们，只拥有其上的 PresentationML 工作。
- `deck.ts` 每页走一次 presentation → slide → layout → master → theme，并把解析完成的上下文交给形状读取器：当前生效的颜色映射、主题的配色方案与字体、母版的标题/正文/其他文本样式、演示文稿默认文本样式，以及从版式回退到母版的占位符查找。
- `shapes.ts` 把三个来源折叠成绝对像素形状：形状自身属性、`p:style` 引用的主题样式矩阵，以及它继承几何与列表样式的占位符。组合形状的子元素被展平到幻灯片坐标系，因此渲染无需变换栈。不带 `type` 的 `p:ph` 是正文占位符，这正是内容占位符能继承正文样式项目符号的原因。
- `text.ts` 按「母版文本样式 → 版式占位符列表样式 → 形状列表样式 → 段落属性 → 运行属性」的顺序装配每个 run。
- `render/` 用绝对定位元素按 CSS 像素绘制（`1 px = 9525 EMU`）。每个形状先画在自己的图层上，文本帧叠在其上，因此预设轮廓会裁切填充而不会裁切溢出的段落；表格视图依据文件给出的列宽与行高绝对定位单元格，使 `gridSpan` 与 `rowSpan` 区域精确落位。

媒体部件随解析一起创建 Blob URL，并由同一个 effect 释放，因此切换文件或关闭标签页都不会泄漏。主体在选中页旁展示缩略图轨，并提供翻页、缩放档位、适应窗口、键盘翻页与演讲者备注；选中页与缩放值存放在注册时声明的按标签页分桶的 store 中，因此主体重新挂载后依然保留。

`ppt` 虽画不出这种旧版二进制格式，仍被刻意认领。不认领它就会继续把它路由到纯文本读取器，对一个本可展示的文件报告「非文本」；认领它，主体才能说出真正的原因和解决办法。

## Alternatives considered

**基于现有库改造。** 许可宽松的候选是 `pptxjs`、`pptx-preview`、`@js-preview/pptx`、`@vue-office/pptx` 与 `@file-viewer/pptx`。它们都是缺少 SmartArt 与 React 组件的局部 DOM 渲染器，其中数个的许可证在本环境无法核实。以它们为起点仍需实现继承链——而可见保真度大部分来自那里——等于多做一份依赖、多带一份许可证声明，却交付同样的工作量。

**WASM 办公引擎。** ZetaOffice 与 LibreOffice-WASM 接近完美保真，但带商业许可与数十兆二进制，并需要 `SharedArrayBuffer` 隔离条件。一个必须在现有标签页内离线工作的预览付不起这个代价。

**文档服务端。** OnlyOffice（AGPL 或商业）与 Collabora 都需要服务端，且会把用户文件送出本机，去完成浏览器本就能做的读取。

**只注册 `ppt`、或干脆不注册 `ppt`。** 认领 `.ppt` 却不提供渲染器，与完全不认领，都会把误导性的纯文本失败留在原地。

**用新的 Sidebar tab 类型替代文档渲染器。** 那会重复文档宿主已提供的标签页、文件读取、工具栏、换行控制与渲染器菜单，并丢掉已经可用的按扩展名切换渲染器的能力。

## Consequences

在文件树中点击 `.pptx` 即可就地渲染：缩略图轨列出每一页，画布按文件记录的尺寸显示选中页，缩放、翻页、备注与键盘导航都无需离开标签页。改动是纯增量的——文档宿主、它的注册表契约以及所有既有渲染器都未被触碰——因此 fork 关于 `ui-sdkwork-*` 命名的规则保证了它在合并上游时保持稳定。

覆盖位于 `tests/`：`zip.client.spec.ts`、`pptx-parse.client.spec.ts`、`render.client.spec.tsx`、`registration.client.spec.ts`、`pptx-body.client.spec.tsx`。夹具在代码里构建 ZIP 容器，因此本包不携带二进制测试数据，且每一种容器变体都能表达为测试输入。

渲染器是有意为之的子集，限制写在包 README 中：图表、SmartArt 与媒体框以带标签的占位符绘制；投影集合之外的预设几何退化为位置与尺寸正确的矩形；`normAutofit` 的缩放会生效，但文本不会为适配而重新断行；完全依赖 `tableStyles.xml` 的表格改用渲染器自带的表头与斑马纹；公式按其回退文本绘制；旧版 `.ppt` 只解释不绘制。

本工作区中有两个仓库门禁在本次改动之前就已是红的，且与本改动无关：`verify-client-ui-i18n` 报告其他 `ui-sdkwork-*` 包中 52 处硬编码字符串；`verify-client-catalog` 因在 `packages/client/ui-sidebar/src/` 中遗留的过期 `slots.d.ts` 里发现重复 slot 声明、以及 `ui-trajectory` 未导出 owner props 接口而中止。由于该生成器在收集阶段即中止，它生成的 `slot-catalog.ts` 无法为本包新占用 `sidebar.right.tab.document` 而重新生成；待上述两个既有问题清除后必须重新生成该文件。
