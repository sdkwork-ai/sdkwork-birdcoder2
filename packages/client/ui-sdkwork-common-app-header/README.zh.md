---
description: "Shared app header for every non-code application mode: drag region, module title, keyed leading glyph seat, trailing actions, and the window-control footprint in the frameless desktop shell."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-common-app-header

[English](README.md) | 中文

## 概述


非代码应用模式的通用顶栏。代码工作台仍在 [ui-conversation](../ui-conversation/README.zh.md) 内使用会话顶栏；其余中心列表面（视频、图片、应用商店、知识库、云盘、资产、Token Plan、账号及占位页）均渲染在本顶栏之下。顶栏提供无边框桌面壳的拖拽区域、当前模块标题、可选的 keyed 前置图标席位、可叠加的尾部动作，以及窗口控制占位，避免 [ui-sdkwork-window-controls](../ui-sdkwork-window-controls/README.zh.md) 的浮动按钮簇遮挡页面内容。

框架在 [ui-layout](../ui-layout/README.zh.md) 中声明 `shell.app-header` 席位，并在活动模式不是 `code` 时将其渲染在 keyed `mode.page` 分发之上。本包装配该席位。

约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 模型体验

无。顶栏只渲染模块 chrome，没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **前置图标为可选贡献**：各模式可向 keyed 的 `shell.app-header.leading` 席位注册；在注册之前，顶栏仅显示标题。
- **代码模式 intentionally 排除**：会话顶栏继续负责该 chrome。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

只有活动模式不是 `code` 时，框架才渲染 `shell.app-header` 席位（由 ui-layout 声明），代码模式的 chrome 仍归 ui-conversation 的会话顶栏所有——不要把 Code 会话路由进本顶栏。前置图标经 keyed 的 `shell.app-header.leading` 席位按需贡献，顶栏同时保留窗口控制占位，使 ui-sdkwork-window-controls 的浮动按钮簇不会遮挡页面内容。

</details>
