---
description: "SDKWork Word、Excel、PowerPoint 文档预览共用的 OOXML 基础能力（OPC 容器、XML 访问、关系解析、颜色、主题、单位）与分页查看 store 声明。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-sdkwork-office

[English](README.md) | 中文

## 概述

面向 SDKWork Office 文档预览的格式无关 OOXML 基础层。它从中央目录读取 OPC 容器，解析带命名空间的 XML，按「声明关系的部件」解析关系目标，解析 DrawingML 颜色以及主题的配色方案与字体，把 EMU、缇、半点与八分之一磅换算为 CSS 像素，并声明所有分页查看器共用的、按标签页分桶的页码与缩放 store。它不注册任何插件，也不持有模块级状态，因此每个预览包都会内联自己的副本。

## 目录

- [负责什么](#what-it-owns)
- [为什么是库而不是插件](#why-it-is-a-library-not-a-plugin)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="what-it-owns"></a>
## 负责什么

| 模块 | 契约 |
| :-- | :-- |
| `ooxml/zip.ts` | 从中央目录读取 OPC 容器，并用 `DecompressionStream('deflate-raw')` 解压条目。条目在首次读取时才解压；处理 ZIP64 扩展字段与归档尾注释。 解压上限按单条目与整包累计设限，恶意容器虚报的尺寸无法驱动无界分配 |
| `ooxml/xml.ts` | 带命名空间的 XML 访问。直接子元素查找与后代查找是两个独立操作，因为 OOXML 会在不同深度复用同名元素。 |
| `ooxml/rels.ts` | 以「声明关系的那个部件」为基准解析关系目标，并把 OPC 带前导斜杠的写法归一化为 ZIP 条目写法。 |
| `ooxml/color.ts` | 以主题配色方案解析 DrawingML 颜色元素并套用其修饰栈（`alpha`、`lumMod`、`lumOff`、`satMod`、`shade`、`tint`），另加 WordprocessingML 的 `themeTint`／`themeShade` 字节修饰符。 |
| `ooxml/theme.ts` | 把 `a:theme` 读成配色方案与主／次字体，并补齐 Office 默认值。 |
| `ooxml/units.ts` | EMU、缇、磅、半点、八分之一磅与 CSS 像素之间的换算，以及 OOXML 角度与百分比。 |
| `paged-view.ts` | 「每个标签页一个页码与一个缩放值」的 `defineStore` 声明。 |

<a id="why-it-is-a-library-not-a-plugin"></a>
## 为什么是库而不是插件

三个预览需要同一套容器、XML、关系、颜色与单位处理。逐包复制会让代码三份并存并触发仓库的重复度检测；让一个预览直接 import 另一个预览的值则被明令禁止，因为功能插件之间只能通过服务与 slot 协作，不能靠共享模块状态。

这里的一切都是纯函数，或是不带跨边界身份的对象（不存在针对这些类型的 `instanceof` 判断，没有单例，没有模块级可变状态），这正好符合客户端构建「可内联」白名单的定义。因此每个预览包各内联一份副本，而 `pagedViewStore` 只是一份交给 `defineStore` 的普通声明，本包自身没有任何运行时依赖。

<a id="model-experience"></a>
## Model Experience

None, as this package is a browser-side library that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; nothing here reaches a model request.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>
- **只支持 stored 与 deflate 两种 ZIP 条目。** OOXML 生产者只产出这两种方法；使用其它方法的归档会以具名错误被拒绝，而不是被静默读错。
- **DrawingML 颜色解析以元素为驱动。** 它解析 `a:srgbClr`、`a:schemeClr`、`a:sysClr`、`a:prstClr`、`a:scrgbClr`、`a:hslClr` 及其修饰符。各格式自己的颜色写法留在各自的包里——演示文稿的颜色映射在 `ui-sdkwork-pptx-preview`，WordprocessingML 的 `w:color` 属性在 `ui-sdkwork-docx-preview`。
- **不支持加密与签名。** 被加密（CFB）容器包裹的 OPC 包，或部件受 IRM 保护的包不可读；读取方会把它报告为无法读取的容器。
- **不做流式解析。** 整包在解析前会被完整物化。文档宿主对文件大小有上限，因此这是被那个上限约束，而不是被本库约束。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文 —— 点击展开</summary>

新增一种格式意味着新增一个消费者，而不是在这里加分支：本库没有任何针对部件名或文档类型的判断。格式专属的关系后缀（`/relationships/slide`、`/relationships/header` 等）放在各自的格式包里；只有 `/officeDocument`、`/relationships/theme`、`/relationships/image` 是共享的。

</details>

**Runtime invariant:** No companion is published. The functions here are pure transformations of bytes and elements, and their correctness is covered by behavior tests; there is no independent runtime observation to compare against.
