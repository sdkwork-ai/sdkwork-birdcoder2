---
description: "SDKWork IM 对话面板：用部署方嵌入包中的对话表层填充 chat 模式的 im.chat.pane 槽位"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im-chat

[English](README.md) | 中文

## 摘要

本插件只拥有一个位置：ui-sdkwork-im-conversations 在聊天模式页内声明的 `im.chat.pane` 槽位。它通过 `ctx.im.mountSurface` 挂载部署方嵌入包中的对话表层（`ChatWindow`：消息历史、输入框、实时更新），并在页面选中另一个会话时切换已挂载的表层。

本插件不编译 IM 源码，也不持有 IM 数据。聊天页负责选中，宿主适配层负责嵌入包与会话，sdkwork-im 负责对话界面。

## 运行时要求

需要 `ctx.slots` 与 `ctx.im`。对话框仅在聊天模式页挂载期间渲染；IM 的翻译与 toast 上下文由嵌入包提供。

## 模型体验

无。本插件渲染面向人的消息界面，不增加提示词内容、工具或会话事件。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **仅对话窗口** —— 群管理、通话浮层与成员面板仍留在完整应用外壳内；对话框只渲染对话窗口。
- **切换会话时重新解析** —— 面板通过 `update` 复用已挂载的表层，但切换会话会传入新的 `conversationId`，嵌入包会重新解析该会话的元数据。
