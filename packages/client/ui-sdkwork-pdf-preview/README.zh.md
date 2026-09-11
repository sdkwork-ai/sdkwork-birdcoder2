---
description: "右侧边栏的 PDF 预览：页面列表 + 可选中文本层覆盖的可缩放页面画布，支持翻页、旋转与缩放，由本包自持的 PDF.js worker 离线渲染。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-pdf-preview

[English](README.md) | 中文

## 概述

在右侧边栏的文档标签页中绘制 `.pdf` 文档。本包在文档注册表中认领 PDF 后缀，并贡献对应的 keyed 主体：左侧页面列表，右侧按阅读顺序连续排布、按需绘制的页面条带，支持翻页、旋转、缩放、文内查找，以及可选中复制的文本层。渲染完全在浏览器内进行，直接使用文档宿主已经读到的字节，经由本包自持的 PDF.js worker 以及内联的字体与图像资源，因此不会上传任何内容，也不会有请求离开浏览器。

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

- **渲染器元数据** —— `ctx.documentPreviews.register(...)`，id 为 `@deepseek-ai/dsh-client-ui-sdkwork-pdf-preview/pdf`，后缀为 `pdf`，`loading: 'bytes-complete'`。不声明 `priority` 即落在 `extension` 档，优先级高于 builtin 档；文档宿主仍会在「打开方式」菜单里列出该后缀的全部候选，因此内置读取器依然可选，而不是被替换。`bytes-complete` 让宿主走它已有的 `readAll` 通路，本包自身不发起任何文件读取。
- **主体** —— 同一个 id 在 keyed `sidebar.right.tab.document` 席位上的组件，使用注册时声明的 Session 级 store。主体拥有文档工具栏以下标签页内的全部内容，舞台元素即本渲染器的滚动容器。

<a id="how-it-renders"></a>
## 渲染方式

- **本包自持的 worker。** 动态客户端包没有模块 URL，因此 PDF.js 的 worker 源码在构建期内联，再由 Blob URL 以 module Worker 启动，并通过显式 port 适配给 PDF.js。worker 启动失败、或未在就绪期限内上报，都会以明确的渲染器失败解释结束打开，而不是无限转圈；打开之后 worker 停止，其失败原因也会穿透销毁流程如实呈现。
- **不触网的资源。** PDF.js 在解析过程中会索取字符映射表、标准字体程序与图像解码器。本次构建把这些文件全部内联，并从内联表中回答每一个请求，因此中日韩文本与未内嵌的标准字体都能离线渲染。每项资源在单个文档内只解码一次，并对外发放副本。
- **一个视口，两层。** 画布按设备像素分配，CSS 盒子仍保持页面自身的尺寸，因此缩放清晰且不改变布局尺寸；文本层完整实现 PDF.js 6 的样式表契约（含旋转页面的变换映射），选区与复制正好落在读者看到的字形上。
- **位图原子换帧。** 每一页都在离屏画布上绘制，完成后一次性换入可见画布——缩放与旋转不会让页面闪白，中断的渲染也不会留下撕裂的半页。
- **旋转作用于视口**，而不是把元素转一下，因此文本层会跟着页面一起旋转。
- **许可证披露。** 客户端产物以头部 banner 形式携带所打包的 PDF.js 与资源许可证，分布式浏览器代码因此能说明自己包含什么。

一个 worker 与一个文档按字节身份持有，并随打开它们的 effect 一并释放；切换文件或关闭标签页都不会留下 worker 或 Blob URL。

<a id="interaction"></a>
## 交互

文档以一条连续条带呈现：每一页按阅读顺序排框，视口附近的页面绘制（并以当前缩放与旋转重绘），远离视口的页面释放光栅。列表每页一个缩略图，滚动进入视口后绘制、离开视口后释放光栅；当前页带 `aria-selected` 与主色边框，且选中项会跟随翻页保持可见，滚动时选区移动到视口中心所在的页面。工具栏提供页码输入框（输入页码后按 `Enter` 或失焦即跳转，`Escape` 还原）、翻页、左右各旋转 90°、缩小/放大一档、回到 `1:1`，以及兼作缩放读数的适应窗口按钮——适应窗口会把小页面放大充满，与 office 系列预览一致。翻页命令把条带滚动到该页顶部，`Home`/`End` 跳到首末页；`+`/`=` 与 `-`/`_` 缩放、`0` 恢复适应——直接按键或配合 `Ctrl`/`Cmd` 均可——`Ctrl`/`Cmd` 加滚轮以指针为锚点缩放，普通滚轮仍为滚动。翻页后落在页面顶部；缩放保持条带的锚定位置不动。查找框随输入逐页全文扫描（忽略大小写），报告匹配计数，其前后按钮按阅读顺序遍历匹配——当前匹配会打开所在页并在画布上高亮，各页其余匹配以弱色显示。页面文本可选中复制，复制内容会剥离 PDF 的填充空字符。加密文档可就地解锁：失败提示变为密码表单，密码错误会如实提示，「取消」则回到锁定状态。

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>
- **不绘制批注、表单域与签名。** 页面位图与文本层会渲染；表单控件与批注外观不会叠加其上，因此填好的表单只显示其页面内容。
- **匹配忽略大小写、以文本片段为单位。** 查找不做变音符折叠；跨越样式变化的匹配只在首个片段内高亮，高亮色带按匹配字符比例定位，而非逐字形测量。
- **渲染是懒加载而非虚拟化。** 视口附近的页面随滚动绘制并释放——缩略图离开视口即释放光栅——内存因此可控，但纵横比与第 1 页不同的页面在首次绘制前会按第 1 页的尺寸排版，且没有双页对开视图。
- **客户端产物较大。** 内联的 worker、字符映射、标准字体与图像解码器让包体约为 6.5 MB，由外壳随插件一起加载，而不是首次使用时按需加载。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者上下文 —— 点击展开</summary>

`pdf/runtime.ts` 负责 worker、port 桥接与销毁；`pdf/page.ts` 负责栅格化与文本层，是唯一接触画布的地方。`pdf/assets.ts` 是 PDF.js 回调的那张表。`tsdown.config.ts` 是离线预览得以成立的原因：它内联 worker 源码、定义资源表、并在头部加上许可证 banner——这三者与 PDF.js 版本同步变更。

</details>

**Runtime invariant:** No companion is published. Rendering is delegated to PDF.js, whose output this package does not re-derive; the package's own contracts are the worker lifetime, which is covered by behavior tests, and the registration precedence over the builtin reader, covered by the registration spec.
