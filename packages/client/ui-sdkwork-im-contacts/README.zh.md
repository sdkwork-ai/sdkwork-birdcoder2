---
description: "SDKWork IM 通讯录模式：通讯录 rail 入口与 keyed 通讯录页，挂载 IM 通讯录表层，并在聊天模式中打开会话"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-im-contacts

[English](README.md) | 中文

## 摘要

本插件拥有 `contacts` 应用模式：一个 rail 入口（通讯录图标集）以及 keyed 的 `mode.page` 页面。页面通过 `ctx.im.mountSurface` 挂载部署方嵌入包中的 IM 通讯录（`ContactsView`：好友、好友申请、群组、资料详情）。

通讯录里的"发消息"经 `ctx.im.openConversation` 回流：它会选中会话并把框架切到聊天模式；通讯录页随这次导航关闭，从不重写聊天创建的逻辑。

## 运行时要求

需要 rail 与 mode-page 的槽位契约（`ui-sdkwork-app-modes`、`ui-layout`）、IAM 门禁（`ui-sdkwork-iam`）与 `ctx.im`。未登录时，IAM 外壳会用登录提示替换页面。嵌入包加载失败、网关缺失或 IM 会话未认证时，通讯录仍保留产品形态的外壳，并通过共享 Toast 上报失败。

## 模型体验

无。本插件渲染面向人的通讯录，不增加提示词内容、工具或会话事件。

#### KV Cache 影响

无。

## 已知限制与后续工作

- **好友申请无角标** —— rail 入口暂不显示待处理好友申请；通讯录界面自身会展示它们。
- **通讯录搜索归表层所有** —— 页面不向已挂载的通讯录传入宿主搜索词。
