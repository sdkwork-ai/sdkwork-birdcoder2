---
description: "SDKWork explorer plugin: the `sdkwork-explorer` right-Sidebar tab type whose body is a VSCode-style tab strip; conversation file, applied-change, and link gestures open editor, diff-preview, and embedded-browser tabs, with open modes configurable in the settings center."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-explorer

[English](README.md) | 中文

## 概述

本插件把 `sdkwork-explorer` 页面类型注册为右侧边栏标签页（`ctx.sidebarRightTabs` + 带键的 `sidebar.right.pane.tab` 席位），其主体就是 explorer 自己的标签条。会话文件与链接手势经本包的跨 bundle DOM 总线认领后，会在其中打开只读编辑器标签页、applied-change 差异预览标签页和内嵌浏览器标签页；一次认领会通过打开该页面亮出这一列，面板的关闭按钮则收起该列。打开方式（内置面板 / 系统应用 / 每次询问）经 Host 设置文档持久化，并可在设置中心修改；差异预览始终使用内置方式。

## 目录

- [概述](#概述)
- [开发备注](#开发备注)

## 开发备注

资源管理器右侧栏标签页为 fork 自有：手势通过本包的 DOM bus 事件（`sdkwork:explorer:open-file/-diff/-url`）认领，宿主以 `ctx.sidebarRight.openTab('sdkwork-explorer')` 展示面板，上游合并无法覆盖 fork 标签页。
