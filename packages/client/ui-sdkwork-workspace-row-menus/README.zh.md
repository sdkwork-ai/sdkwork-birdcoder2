---
description: "SDKWork fork 插件：侧边栏工作区浏览区的行操作菜单，从 ui-workspace 抽离为 fork 自有包，保证 fork 侧菜单扩展高内聚、merge 稳定。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-workspace-row-menus

[English](README.md) | 中文

## 概述


SDKWork fork 插件：侧边栏工作区浏览区的行操作菜单——工作区（项目）`⋯` 菜单、会话 `⋯` 菜单、项目行右键菜单——从 `ui-workspace` 抽离为 fork 自有包，保证 fork 侧菜单扩展高内聚、merge 稳定。

## 目录

- [拥有的菜单](#拥有的菜单)
- [集成方式](#集成方式)
- [开发备注](#开发备注)

## 拥有的菜单

- **工作区菜单**（项目行 `⋯`）：重命名、删除工作区（danger）。
- **会话菜单**（会话行 `⋯`）：重命名、分叉会话、归档会话。
- **项目右键菜单**（项目行右键）：与工作区菜单相同的条目，走同一组回调。
- 独立 locale 命名空间 `sdkwork-workspace-row-menus`（zh/en）。

菜单壳使用共享的 `ui-primitives` `Menu` 原语（portal、指针离开宽限、danger 样式）；本插件只拥有业务菜单项与其派发逻辑。

## 集成方式

`ui-workspace` 仍是表面所有者（行、悬停卡、拖拽、对话框）。其浏览器端注册声明子槽 `sidebar.workspaces.rowMenus` 并通过 `renderSlot` 渲染；本插件将菜单渲染器注册进该槽。槽位空缺时浏览器回退到内置的上游菜单实现，因此不带本插件的组装保持原版行为。

动作（重命名/分叉/归档/删除）仍由浏览器持有：菜单组件接收行数据与内置菜单相同的动作回调，派发逻辑保持不变。

## 开发备注

`sidebar.workspaces.rowMenus` 槽位与内置回退位于 `ui-workspace`（上游持有的表面、fork 适配的注册），因此上游合并不会与本包冲突：只有本包的渲染器注册与 locale 命名空间是 fork 自有面。
