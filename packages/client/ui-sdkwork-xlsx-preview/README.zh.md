---
description: "右侧边栏的表格预览：离线 SpreadsheetML 渲染器，按 Excel 自身的窗口版式绘制——名称框、编辑栏、工作表标签栏、状态栏，以及 Office 一致的虚拟化单元格网格，支持 .xlsx/.xlsm/.xltx/.xltm。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-xlsx-preview

[English](README.md) | 中文

## 概述

在侧边栏打开工作簿，按 Excel 的样子读它：工作表自身的字体、填充、边框、合并区域、冻结窗格与数字格式都按存储原样呈现，全程无需服务端或转换器。窗口版式也是 Excel 自己的，从名称框、编辑栏一直到工作表标签栏与状态栏。用键盘或指针选中单元格与区域，并沿网格追查公式。只有屏幕内的单元格会被挂载，因此拥有十万填充行的工作簿，打开成本只与可见部分相当。

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

- **渲染器元数据** —— `ctx.documentPreviews.register(...)`，id 为 `@deepseek-ai/dsh-client-ui-sdkwork-xlsx-preview/xlsx`，后缀为 `xlsx`、`xlsm`、`xltx`、`xltm`、`xlsb`、`xls`，`loading: 'bytes-complete'`。不声明 `priority` 即落在 `extension` 档，优先级高于 builtin 档。`bytes-complete` 让文档宿主走它已有的 `readAll` 通路，本包自身不发起任何文件读取。
- **主体** —— 同一个 id 在 keyed `sidebar.right.tab.document` 席位上的组件，使用注册时声明的 Session 级 store。主体接收 `resourceAddress`、`content`、`wrap`、`scrollportRef` 与 `useTabInfo`，并拥有文档工具栏以下标签页内的全部内容。工作表画布就是本渲染器的滚动容器，因此宿主能在重新挂载后恢复此前的滚动位置——虚拟窗口也从恢复出的偏移开始，而不是回到表格原点。
- **共享查看状态** —— 当前工作表与缩放值，经共享的 `pagedViewStore` 声明按标签页 id 分桶，因此切换标签页再回来会停在原来那个工作表。

`xls` 与 `xlsb` 是被刻意认领的，即便渲染器画不出它们。旧版 BIFF 与二进制工作簿格式若不被认领，会回退到纯文本读取器，把一个本可展示的文件报告成「非文本文件」；认领它们，主体就能说出真正的原因和解决办法。

<a id="how-it-renders"></a>
## 渲染方式

- **容器与关系图** —— 由共享库 `@deepseek-ai/dsh-client-sdkwork-office` 读取 OPC 包、解析工作簿关系并读取主题。
- **样式** —— `styles.ts` 通过每个单元格的 `cellXfs` 索引组合并行的 `numFmts`、`fonts`、`fills`、`borders` 四张表，并解析 `rgb`、`theme`（按 Excel「浅色在前」的主题顺序与带符号 tint）与 `indexed` 三种颜色写法。
- **数字格式** —— `number-format.ts` 实现 Excel 的格式代码：最多四段 `;` 分区、带千分位与缩放的数字占位符、百分比与科学计数法、基于工作簿序列号的日期时间代码（含 1900 闰年怪例与 1904 日期系统），以及字面量与文本分区。
- **工作表** —— `workbook.ts` 读取列宽、行高、合并区域、冻结窗格、超链接，以及锚定在网格上的图片，并把字符宽度与磅值高度换算为像素。它也读取工作表自身的视图：是否绘制网格线、是否从右到左排版、是否显示行列表头带，以及保存时的缩放比例。隐藏的行列会被移出可见索引，而不是以零尺寸参与排布，因此网格永远不会走过一段空隙。
- **布局** —— `render/geometry.ts` 把该索引换算为累计像素偏移，于是虚拟窗口只需问出首个可见列的偏移再向后走；一张为第十万行声明了行高的表，成本是一个数组项，而不是十万个。
- **画布** —— `render/SheetGrid.tsx` 只挂载滚动窗口覆盖到的位置，并与冻结窗格取并集，绘制行列表头带、工作表要求的网格线、合并区域，以及选中态装饰：区域用文字下方的浅色底，当前单元格用 Excel 的绿色粗框与填充柄。
- **文本** —— 单元格的对齐方式决定其文本是被限制在本格内，还是允许溢出到两侧「什么都没有」的邻格，这正是长标签在预览里与在 Excel 里读起来一致的原因。换行与旋转的文本直接摆放，不需要测量一遍。

媒体部件会随解析结果一起创建 Blob URL，并随产生它的 effect 一并释放；切换文件或关闭标签页都不会泄漏。

<a id="interaction"></a>
## 交互

版式自上而下就是 Excel 自己的：名称框给出当前选中（`B2`、`A1:C3`、`2:3`、`B:C`），编辑栏显示当前单元格的原始值——若有公式则显示公式。工作表画布带行号与列标表头，点表头即选中整行或整列，并以底色标出选中范围。底部标签栏切换工作表，状态栏切换上一个/下一个工作表并驱动缩放；缩放读数同时兼作适应窗口控件。

网格以键盘为先，正如电子表格本该如此。方向键逐格移动，`Tab` 与 `Enter` 沿行与列行走，`Home` 与 `End` 跳到本行两端，`Ctrl+Home`/`Ctrl+End` 跳到表格四角，`PageUp`/`PageDown` 翻一屏，按住 `Shift` 则从起点扩展选区。指针点击选中单元格，`Shift` 点击扩展选区，双击选中整张工作表；每次移动后网格都会把当前单元格滚动到可见范围内。

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>
- **旧版 `.xls` 与二进制 `.xlsb` 只解释，不绘制。** BIFF8 与二进制工作簿格式完全是另一种容器；主体会报告该情况并给出解决办法，而不是显示一张空网格。
- **图表、形状与文本框不绘制。** 锚定在网格上的图片会渲染；其它绘图对象直接跳过而不显示占位符，因为表格里的绘图通常只是对已经能正确读出数据的批注。
- **不套用条件格式。** 单元格显示其存储值与 `cellXfs` 样式；`dxfs` 表中的规则不会被求值。
- **不渲染数据验证、批注与迷你图。**
- **公式只显示不计算。** 单元格显示 Excel 存下的缓存值；若工作簿未存缓存值，则显示空单元格并在编辑栏给出公式。
- **图案填充用其前景色近似**，单元格渐变不绘制。
- **不测量单元格内文本的实际宽度。** 文本按邻格占用情况溢出或裁切，规则与 Excel 一致，但比可用空间更宽的一段文字会被直接裁掉，没有 Excel 那种按测量结果省略的效果。
- **声明从右到左排版的工作表按从左到右绘制。** 工作表自身的 `rightToLeft` 标记没有作用到网格上，因此 RTL 工作表的列序与 Excel 相比是镜像的。
- **合并区域若指向工作表从未写过的位置**，会被收敛到最后可见位置，而不会画到表格之外。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文 —— 点击展开</summary>

最值得先读的是 `number-format.ts`：它是从（值、格式代码）到显示字符串的纯函数，并承载了钉住 Excel 行为的测试，包括 1900 闰年怪例。其次是 `render/geometry.ts`：整套虚拟化契约都在那里，而 `render/SheetGrid.tsx` 只是它之上的一遍绘制。`xlsx/` 与 `render/` 中没有任何地方 import Cordis、slot 或其他插件。

</details>

**Runtime invariant:** No companion is published. The parse is a pure function from package bytes to a model, and the viewing state belongs to the shared store declaration; there is no second independent observation to compare against. Registration disposal and the Blob URL lifetime are covered by behavior tests.
