---
description: "右侧边栏的 PowerPoint 预览：离线 OOXML 渲染器，左侧幻灯片缩略图轨 + 右侧页面画布，遵循文件自带的主题、母版与版式。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-pptx-preview

[English](README.md) | 中文

## 概述

在右侧边栏的文档标签页中绘制并编辑 `.pptx` 演示文稿。任意形状上的文字都可原位编辑——双击打开覆盖在形状上的编辑框，提交后画布即时重渲染；舞台下方的演讲者备注面板常驻可编辑；「保存副本」只重写被触碰的部件并下载演示文稿。本包在文档注册表中认领演示文稿后缀，并贡献对应的 keyed 主体：左侧幻灯片缩略图轨，右侧当前页画布，外加缩放、翻页与演讲者备注。解析完全在浏览器内进行，直接使用文档宿主已经读到的整包字节，并沿「幻灯片 → 版式 → 母版 → 主题」的继承链展开，因此不需要服务端、转换器或网络往返，就能得到与 PowerPoint 接近的画面。

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

- **渲染器元数据** —— `ctx.documentPreviews.register(...)`，id 为 `@deepseek-ai/dsh-client-ui-sdkwork-pptx-preview/pptx`，后缀为 `pptx`、`pptm`、`ppsx`、`potx`、`ppt`，`loading: 'bytes-complete'`。不声明 `priority` 即落在 `extension` 档，优先级高于 builtin 档，因此演示文稿不会回退到纯文本读取器。`bytes-complete` 让文档宿主走它已有的 `readAll` 通路，本包自身不发起任何文件读取。
- **主体** —— 同一个 id 在 keyed `sidebar.right.tab.document` 席位上的组件，使用注册时声明的 Session 级 store。主体接收 `resourceAddress`、`content`、`wrap`、`scrollportRef` 与 `useTabInfo`，并拥有文档工具栏以下标签页内的全部内容。舞台元素就是本渲染器的滚动容器，因此宿主能在重新挂载后恢复此前的滚动位置。
- **共享查看状态**，按标签页 id 分桶：当前选中的幻灯片，以及缩放值（`'fit'` 或固定倍数）。store 的生命周期长于主体卸载，因此切换标签页再回来会停在原来那一页。

`ppt` 是被刻意认领的，即便渲染器画不出这种旧版二进制格式。若回退到纯文本读取器，一个本可展示的文件会被报告成「非文本文件」；认领它，主体就能说出真正的原因和解决办法。

<a id="how-it-renders"></a>
## 渲染方式

- **容器** —— `zip.ts` 从中央目录读取 OPC 包，并用 `DecompressionStream('deflate-raw')` 解压条目，因此本包不引入 ZIP 依赖。条目在首次读取时才解压；超出读取器解压上限（单条目或整包累计）的声明会被拒绝，而不是被分配内存。
- **关系图** —— `rels.ts` 以「声明关系的那个部件」为基准解析关系目标；`deck.ts` 沿 presentation → slide → layout → master → theme 走图，每个版式经由它自己声明的关系解析到母版。每个母版携带自己的主题，因此按节切换设计的演示文稿，每一节都能保住自己的配色与字体。
- **形状** —— `shapes.ts` 把形状自身的属性、`p:style` 引用的主题样式矩阵，以及它继承的版式/母版占位符，三者折叠成使用绝对像素的形状。组合形状的子元素被展平到幻灯片坐标系。自选图形（`a:custGeom`）投影为形状像素尺寸的 CSS `path()` 裁剪；图表与 SmartArt 直接绘制 Office 随文件嵌入的缓存回退图；幻灯片下方的母版与版式上的非占位符形状——logo、装饰条——会先于幻灯片自身形状绘制（`showMasterSp="0"` 抑制母版层）；页脚、日期与页码占位符在 `p:hf` 启用时绘制，装饰层逐页折叠，页码字段携带真实页位。
- **文本** —— `text.ts` 按「演示文稿或母版文本样式 → 版式占位符列表样式 → 形状列表样式 → 段落属性 → 运行属性」的顺序装配每个 run。百分比行距按倍数渲染，`spcPts` 精确行距按像素高度渲染，百分比 bullet 相对自身 run 取字号，声明 `numCol` 的文本框按该栏数分栏排版。携带 `a:hlinkClick` 的 run 保留链接——段内跳转在预览内导航，web 与 mail 目标外部打开——无样式的链接按主题 hlink 颜色着色并加下划线。
- **呈现** —— `render/` 用绝对定位元素绘制模型：每个形状先画在自己的图层上，文本帧叠在其上，因此预设轮廓会裁切填充而不会裁切溢出的段落。在被裁剪的轮廓上，描边以第二条色带沿几何绘制而非盒边框；连接线按线的声明长出箭头；单元格未声明填充的表格按主题套用 Office 默认外观（主题色表头、浅色斑马纹）。

媒体部件会随解析结果一起创建 Blob URL，并随产生它的 effect 一并释放；切换文件或关闭标签页都不会泄漏；解析在媒体解析完成后失败时，也会自行释放。

<a id="interaction"></a>
## 交互

缩略图轨按演示顺序列出每一页并显示实时缩略图；当前页带 `aria-selected` 与主色边框，演示文稿标记为隐藏的页面带「已隐藏」徽标。缩略图经由一个共享的 IntersectionObserver 懒挂载，百页级演示文稿也只保留临近页面的元素树。工具栏可上一页/下一页、缩小/放大一档、显示当前缩放读数、回到 `1:1`、切换适应窗口；Ctrl+滚轮以更细的档位围绕视口中心缩放。通过工具栏或键盘翻页时，缩略图轨会滚动到当前页。舞台获得焦点时，`ArrowUp`/`ArrowDown`、`ArrowLeft`/`ArrowRight`、`PageUp`、`PageDown`、`Home`、`End` 均可翻页；`+`/`-` 调整缩放，`0` 回到 `1:1`。当前页存在演讲者备注时，备注显示在舞台下方。

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>
- **旧版 `.ppt` 只解释，不绘制。** PowerPoint 97–2003 的二进制格式完全是另一种容器；主体会报告该情况并给出解决办法，而不是显示一张空白画布。
- **图表、SmartArt 与公式绘制其缓存回退图。** Office 在这些框旁嵌入了渲染好的图片；预览在框的位置与尺寸上显示该图片。没有携带回退图的框仍以带标签的占位符呈现。绘制其背后的实时模型属于另一项工作，需要独立的保真预算。
- **编辑仅限文字与备注。** 原位编辑覆盖形状文字与演讲者备注；移动/缩放形状、新增形状、母版编辑与修订历史暂不在范围内。
- **浏览器无法解码的图片以带标签的占位符呈现。** EMF 与 WMF 图元文件保留其边框并如实说明，而不是直接消失。
- **部分几何预设仍退化为矩形。** 自由路径、多边形、圆角（含双角变体）、椭圆、pie/chord 扇形区域、完整圆环、弧形条带与连接线会按真实轮廓绘制；开口 `arc` 曲线、`teardrop` 与固定多边形的调整值暂不支持。
- **文本不做形状自适应排版。** `normAutofit` 的 `fontScale` 会生效，但溢出文本框的段落不会按 PowerPoint 的文本适配器重新断行。
- **表格样式角色的文本强调为近似推断。** 演示文稿的 `tableStyles.xml` 已被解析，带样式的表格保住其精确的按角色填充与边框——包括按角色修改过的主题色；深色表头的白字加粗由填充亮度推断而非读取样式，列条纹计数固定为一条。
- **段内跳转链接可在预览内导航。** 指向其他幻灯片的链接会把预览切到目标页，舞台与缩略图轨同步；web 与 mail 链接外部打开；其他协议与缺失目标按普通文本渲染，日期字段显示生成方缓存的值而非当前日期。
- **WordArt 轮廓、发光与倒影不渲染。** 加粗/斜体/删除线、含波浪与双线的下划线、文字阴影、高亮与基线偏移均可绘制；形状阴影按真实的方向、距离、模糊与颜色绘制；文本上的渐变填充与其余效果暂不支持。
- **嵌入字体不渲染，动画不属于文档内容。** 非主题字体回退到浏览器字体栈；动画是放映期行为而非文档内容。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文 —— 点击展开</summary>

本渲染器是有意为之的子集，取舍依据是「普通商务演示文稿里有什么」，而不是 schema 里有什么。`render/` 与 `pptx/` 都是呈现无关的：两者都不 import Cordis、slot 或其他插件。测试夹具在代码里构建 ZIP 容器（`tests/zip-fixture.ts`），因此不需要二进制测试数据，且每一种容器变体都能表达为测试输入。

</details>

**Runtime invariant:** No companion is published. The parse is a pure function from package bytes to a model, and the viewing state belongs to the declared Slot store; there is no second independent observation to compare against. Registration disposal and the Blob URL lifetime are covered by behavior tests.
