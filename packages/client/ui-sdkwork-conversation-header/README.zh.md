---
description: "SDKWork 会话头部插件：将对话会话头部主体替换为单行布局，视图导航变成居中的 icon+文字分段控件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-conversation-header

[English](README.md) | 中文

## 概述

本插件为 SDKWork 重新设计对话会话头部。上游头部在标题行（面包屑 + 操作 + 工具）之下渲染一整行视图 tabs（「对话」/「轨迹」）——两个标签占掉一整行空间。本插件认领 `ui-conversation` 声明的 `conversation.session.header.surface` 席位，将头部主体替换为单行布局：

1. 左侧：面包屑簇（会话层级），再是操作条。
2. 中部：视图导航的 icon+文字分段控件——原来的整行 tabs 变成紧凑控件，节省一行头部空间。
3. 右侧：工具簇。

上游主体保留为 fallback：没有本插件（或插件被禁用）时，头部渲染与原先完全一致。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## 使用本包

将插件挂载为 web-app bundle 的一部分（`packages/bundle/web-app/cordis.patch.yml` 中一行 roster，加上 web-app 与 desktop 清单中的工作区依赖）。插件激活后，对话头部即渲染为单行布局。删除 roster 行即恢复上游双行头部。

<a id="understand-the-implementation"></a>

## 理解实现

- `src/client/index.ts` — 注册词典，并通过延迟的 `slots.inject` 认领 `conversation.session.header.surface` 席位。
- `src/client/ConversationHeader.tsx` — surface 组件。它是上游 header entry 下发 owner share（子席位分发器、导航回调、面包屑链、视图名册、当前视图 id）的纯函数；渲染面包屑、居中的分段控件（`role="tablist"`，已知视图 id 使用 lucide 图标）以及操作/工具席位。
- `src/client/ConversationHeader.module.css` — 三区 grid（`1fr auto 1fr`），在任意列宽下都让分段控件真正居中，样式使用共享的 DSW alias token。
- `src/client/locales.ts` — 插件自有的 `sdkworkConversationHeader` 词典命名空间（aria 标签）。

上游 header entry 保留 `<header>` 外壳、空白会话隐藏与视图选择 store；本插件只拥有呈现层，不触碰跨插件可变状态。

### 席位归属（merge-stable 契约）

`conversation.session.header.surface` 席位拥有**整个**头部主体，包含视图 tabs 条。上游外壳自己不再渲染任何视图导航——它的 tabs 条位于席位 fallback 主体内部，因此认领者替换它，而不是与它并排。有两个表面属于外壳，绝不能在此渲染：

- **视图 tabs 条**——外壳的 fallback 主体渲染它；本插件渲染替换它的分段控件。两者同时渲染就是 2026-09-18 的回归：真实会话里出现两条 tabs 条（`[role="tablist"]` 计数为 2），上下叠着。
- **最右侧角落**（`conversation.session.header.corner`）——外壳席位，在**每个**阶段都保持挂载，包括外壳完全隐藏席位主体的空白/hero 阶段。在此再渲染一份，既会在真实会话里把控件翻倍，又会在 hero 阶段丢掉它。

该不变量由 `tests/header-seat-assembly.client.spec.tsx` 在**同一个装配 DOM 里按计数**断言：用真实外壳挂载真实插件；回归的两半在落地前都验证过会让该套件变红（变异体均被杀死）。

### 行宽与自适应

席位 outlet 的锚点带 `display: contents`，因此它不产生盒子、**永远不能成为 flex item**——外壳把 `flex: 1` 放在锚点的**子元素**上，而不是锚点本身。于是主体拥有「固定宽度的前导席位与角落」之外的全部宽度，并由自己的 grid 分配：

- `minmax(0, 1fr) auto minmax(0, 1fr)` 让分段控件在任意宽度下都处于**真正的中间**、工具簇贴住右缘。
- `minmax(0, …)`（而非裸 `1fr`）正是行**自适应**的原因：右侧面板开合时应用框架会收窄中列，这些轨道随之收缩到内容宽度以下，而不是溢出。没有这个 0 下限，grid 轨道会卡在内容的 min-content 宽度上，整行溢出所在列。

在**真实 Chrome** 中按 1440/1100/900/700/520 px 逐档实测：主体在每一档都精确填满行、控件保持居中（≤2 px）、无任何溢出。该选择器契约由 `ui-conversation` 的 `tests/header-seat-styles.client.spec.ts` 锁定。

<a id="known-limitations-and-deferred-work"></a>

## 开发备注

本包是遵循仓库命名契约的 fork 包（带 `sdkwork` 标记）。主体不读取任何会话 store：上游 header entry 下发的 owner share 已携带它渲染所需的全部事实。

## 运行时不变量

不发布运行时不变量伴随检查；该包是 UI 插件，其唯一的 slot 注册通过规格测试套件验证销毁（HMR 安全）。

## 模型体验

无：本包是浏览器侧的头部呈现层；其渲染的每个事实都由下层 store（sessions、conversation views）持有。

#### KV Cache effect

无；surface 只渲染日志与列表状态，不组装也不修改 provider 请求。

## 已知限制与后续工作

- 未注册图标的视图（id 不是 `chat`/`trajectory`）渲染纯文字分段。
- 仅注册了多个视图时才显示分段控件，与上游 tabs 的显示门槛一致。
