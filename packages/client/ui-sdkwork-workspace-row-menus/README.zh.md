---
description: "SDKWork fork 插件：侧边栏工作区浏览区的行操作菜单，从 ui-workspace 抽离为 fork 自有包，保证 fork 侧菜单扩展高内聚、merge 稳定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-workspace-row-menus

[English](README.md) | 中文

## 概述


SDKWork fork 插件：侧边栏工作区浏览区的行操作菜单——工作区（项目）`⋯` 菜单、会话 `⋯` 菜单、项目行右键菜单——从 `ui-workspace` 抽离为 fork 自有包，保证 fork 侧菜单扩展高内聚、merge 稳定。

## 目录

- [拥有的菜单](#what-it-owns)
- [集成方式](#how-it-integrates)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)

<a id="what-it-owns"></a>
## 拥有的菜单

- **工作区菜单**（项目行 `⋯`）：打开文件夹、复制路径、在终端打开（路径动作行，仅在有工作目录时可用）、发布项目、重命名、删除工作区（danger）。
- **会话菜单**（会话行 `⋯`）：相同的路径动作行，外加复制会话ID、导出会话日志、重命名、分叉会话、归档会话。
- **项目右键菜单**（项目行右键）：与工作区菜单相同的条目，走同一组回调。
- 独立 locale 命名空间 `sdkwork-workspace-row-menus`（zh/en）。

菜单壳使用共享的 `ui-primitives` `Menu` 原语（portal、指针离开宽限、danger 样式）；本插件只拥有业务菜单项与其派发逻辑。两个 Host RPC（打开文件夹、在终端打开）通过 `Toast` 结果横幅回报结局：成功显示已请求文案，失败显示可重试文案——被拒绝的 `host.openPath` 不会表现为"点了没反应"。

<a id="how-it-integrates"></a>
## 集成方式

`ui-workspace` 仍是表面所有者（行、悬停卡、拖拽、对话框）。其浏览器端注册声明子槽 `sidebar.workspaces.rowMenus` 并通过 `renderSlot` 渲染；本插件将菜单渲染器注册进该槽。槽位空缺时浏览器回退到内置的上游菜单实现，因此不带本插件的组装保持原版行为。

动作（重命名/分叉/归档/删除）仍由浏览器持有：菜单组件接收行数据与内置菜单相同的动作回调，派发逻辑保持不变。

<a id="dev-note"></a>
## 开发备注

`sidebar.workspaces.rowMenus` 槽位与内置回退位于 `ui-workspace`（上游持有的表面、fork 适配的注册），因此上游合并不会与本包冲突：只有本包的渲染器注册与 locale 命名空间是 fork 自有面。

<a id="model-experience"></a>
## 模型体验

无，因为本包只是人类使用的表面 chrome。行菜单渲染侧边栏条目并派发浏览器持有的动作；它们发出的两个 Host RPC（`host.openPath`、`host.openTerminal`）只携带一个文件系统路径，自身不注册任何提示词、schema 或结果文本。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与暂缓事项

- **行范围** —— 菜单只服务于侧边栏浏览器的工作区与会话行；其余表面仍渲染 ui-workspace 内置的上游菜单。
- **点击前不做桌面门控** —— 派发前不检查没有桌面打开器的 Host（`host.describe.canOpenPath: false`）；被拒绝的 RPC 经结果横幅回报，而不是预先禁用菜单行。
