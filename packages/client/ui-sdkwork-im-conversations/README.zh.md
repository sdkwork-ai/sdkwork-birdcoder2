---
description: "SDKWork IM 会话列表模式：带未读气泡的聊天 rail 入口、挂载 IM 会话列表的 chat 模式页，以及由对话插件填充的 im.chat.pane 槽位"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im-conversations

[English](README.md) | 中文

## 摘要

本插件拥有 `chat` 应用模式：一个 rail 入口（含未读气泡与聊天/通讯录图标集）以及 keyed 的 `mode.page` 页面。页面是两栏结构——左列是挂载的 IM 会话列表，右列是选中的对话——并声明 `im.chat.pane` 槽位，让对话界面由它自己的插件提供。

选中会话与未读总数来自 `ctx.im`（ui-sdkwork-im）。页面从不直接访问 IM 传输，也从不 import IM 源码：会话列表通过 `ctx.im.mountSurface` 从部署方的嵌入包挂载，右列由 ui-sdkwork-im-chat 渲染。

## 运行时要求

需要 rail 与 mode-page 的槽位契约（`ui-sdkwork-app-modes`、`ui-layout`）、IAM 门禁（`ui-sdkwork-iam`）与 `ctx.im`。未登录时，IAM 外壳会用登录提示替换页面。

## 模型体验

无。本插件渲染面向人的消息界面，不增加提示词内容、工具或会话事件。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **会话搜索尚未接通** —— IM 列表保留自己的搜索框行为；宿主暂不传入搜索词。
- **失败保留在产品外壳内** —— 嵌入包加载失败、网关缺失或 IM 会话未认证时，两栏页面仍保留列表与内容区，并用产品形态的占位显示；共享 Toast 说明失败原因。在宿主加入重试控件之前没有重试按钮。
