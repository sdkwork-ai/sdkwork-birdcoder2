---
description: "SDKWork 会话头部插件：将对话会话头部主体替换为单行布局，视图导航变成居中的 icon+文字分段控件，并在标题面包屑旁以 chip 显示当前会话的项目目录名。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-conversation-header

[English](README.md) | 中文

## 概述

本插件为 SDKWork 重新设计对话会话头部。上游头部在标题行（面包屑 + 操作 + 工具）之下渲染一整行视图 tabs（「对话」/「轨迹」）——两个标签占掉一整行空间。本插件认领 `ui-conversation` 声明的 `conversation.session.header.surface` 席位，将头部主体替换为单行布局：

1. 左侧：面包屑簇（会话层级），随后是项目目录 chip（文件夹图标 + 会话 cwd 的工作区基名，cwd 不存在时隐藏），再是操作条。
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
- `src/client/ConversationHeader.tsx` — surface 组件。它是上游 header entry 下发 owner share（子席位分发器、导航回调、面包屑链、视图名册、当前视图 id）的纯函数；渲染面包屑、项目目录 chip（会话 cwd 经 `useSessions` 全局 standard prop 读取——与 ConversationRoot 读取的是同一个 store，因此没有新增契约或 wire 调用）、居中的分段控件（`role="tablist"`，已知视图 id 使用 lucide 图标）以及操作/工具席位。
- `src/client/ConversationHeader.module.css` — 三区 grid（`1fr auto 1fr`），在任意列宽下都让分段控件真正居中，样式使用共享的 DSW alias token。
- `src/client/locales.ts` — 插件自有的 `sdkworkConversationHeader` 词典命名空间（aria 标签）。

上游 header entry 保留 `<header>` 外壳、空白会话隐藏与视图选择 store；本插件只拥有呈现层，不触碰跨插件可变状态。

<a id="known-limitations-and-deferred-work"></a>

## 开发备注

本包是遵循仓库命名契约的 fork 包（带 `sdkwork` 标记）。项目目录 chip 经 `useSessions` 全局 standard prop 读取会话 cwd —— 与 ConversationRoot 读取的是同一个 store —— 因此没有新增契约或 wire 调用。

## 运行时不变量

不发布运行时不变量伴随检查；该包是 UI 插件，其唯一的 slot 注册通过规格测试套件验证销毁（HMR 安全）。

## 模型体验

无：本包是浏览器侧的头部呈现层；其渲染的每个事实都由下层 store（sessions、conversation views）持有。

#### KV Cache effect

无；surface 只渲染日志与列表状态，不组装也不修改 provider 请求。

## 已知限制与后续工作

- 未注册图标的视图（id 不是 `chat`/`trajectory`）渲染纯文字分段。
- 仅注册了多个视图时才显示分段控件，与上游 tabs 的显示门槛一致。
