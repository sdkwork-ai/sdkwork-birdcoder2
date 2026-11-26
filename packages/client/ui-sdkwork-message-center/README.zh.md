---
description: "SDKWork 消息中心：模式栏中位于设置上方的信封快捷入口，以及据此在中间栏取代当前对话的消息页面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-message-center

[English](README.md) | 中文

## 摘要

以现有框架的两个席位提供账户消息中心：模式栏中位于设置正上方的信封快捷入口，以及它选中的消息页面——中间栏从当前对话切换为该页面。模式栏标记统计未读通知数；页面按本地日历日分组，就地打开单条消息，并在用户打开时把未读通知标记为已消费。选择快捷入口只是普通的页面选择，绝不是弹窗。

## 目录

- [使用本包](#use-this-package)
- [通知契约](#notification-contract)
- [配置](#configuration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

Web 组合以 `ui-sdkwork-message-center` 挂载本插件。它只贡献两个席位：

- **模式栏快捷入口**（`mode.rail.panel`，id `message-center`，order `20`）。面板席位按升序渲染，因此 `20` 位于 IM 连接器行（`10`）之下、设置席位正上方。单元格是 44px 图标：存在未读消息时显示未读信封字形与圆点，否则显示已读信封字形。点击会重新读取第一页，并把 `message-center` 选为中间栏的主面板；当消息页面占据中间栏时，单元格绘制选中态。它在任何组合中都会渲染；缺少服务地址或会话是页面自身的状态，而不是一个失效的图标。
- **消息页面**（`main`，key `message-center`）。面板被选中时，框架用它取代对话渲染这个键控条目。页眉承载居中标题、未读摘要行、详情视图的返回控件、刷新动作与关闭按钮（关闭即重新选回当前对话）；主体承载状态块、按日分组和就地详情视图。

快捷入口与页面读取同一个快照源，因此未读标记与页面渲染的未读状态不会互相矛盾。插件负责轮询、未读标记、确认与展示；通知服务负责可见性、排序与消费。页面打开期间左侧栏保持原位，选中任一会话即可让中间栏回到该对话。

启动时以及每次凭据或环境写入都会开启新的读取周期并立即发出 `list` 请求。凭据写入来自 `ctx.iam.sessionTokens()` 与 `ctx.iam.onAuthToken()`；当会话不携带访问令牌时，当前环境配置里的静态 `accessToken` 会补充访问令牌请求头，因此带有引导令牌的部署同样可以读取。选中快捷入口会重新读取第一页；未读标记轮询按 `pollIntervalMs` 执行，直到插件被释放。页面就是前 `pageSize` 条通知；`hasMore` 会渲染加载更多行。除已挂载的快照外，浏览器不保存任何内容。

每种失败都会为展示层分类：凭据被拒绝（`401`，或不带 CORS 问题码的 `403`）会清空未读标记并显示带应用内登录手势（`requestSignInInPlace`）的已登出空状态；尚无缓存页时的网络或网关失败显示重试状态；后续失败则在缓存页之上显示重试横幅。确认是乐观的：通知在写入前先标记为已读，写入被拒绝时报告横幅并在下一次读取时校正，凭据被拒绝时回到已登出状态。

<a id="notification-contract"></a>
## 通知契约

插件使用当前环境应用 API 网关下的应用通知 API：

| 操作 | 请求 |
|---|---|
| 列表 | `GET /app/v3/api/notification/notifications?page=<n>&page_size=<n>` |
| 确认 | `POST /app/v3/api/notification/notifications/<id>/acknowledge` |

请求携带 SDKWork 双令牌凭据头（`Access-Token` 与 `Authorization: Bearer`），两者都可缺席且都来自会话。请求有意不发送 `app_id`：平台从凭据推导应用上下文，并拒绝客户端自带的上下文选择器。响应使用共享的 `{ code, data, traceId }` 信封；`data` 为 `{ items, pageInfo }`。

每条通知携带 `id`、`appId`、`title`、`desc`、`content`、`time`、`type`（`info`/`billing`/`warning`/`alert`）、`read`、`showAsPopup`、`popupSeen`、`archived` 以及可选的 `actionUrl`。正文为空时回退到摘要。不可用的条目会被跳过并记录诊断，因此相邻的有效条目仍会渲染；`pageInfo.hasMore`，或 `page < totalPages`，报告是否还有下一页。页面按解析后的发布时间把通知排成由新到旧，未带时间的通知排在最后，并用其文本开头的日期作为未带时间通知的分组前缀。仅当 `actionUrl` 是绝对 HTTP(S) URL 或站点相对路径时才会变成链接。

<a id="configuration"></a>
## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `pollIntervalMs` | `60000` | 未读标记轮询间隔，单位毫秒。 |
| `pageSize` | `20` | 每页请求的通知数；该 API 接受 1–200。 |

两个字段都是 volatile，因此 `cordis.yml` 的修改会在下一次轮询时到达已打开的页面，无需重新挂载插件。API 源与静态访问令牌来自共享的 [ui-sdkwork-env](../ui-sdkwork-env/README.zh.md) 配置；凭据三元组来自 `ctx.iam`。

<a id="model-experience"></a>
## 模型体验

无，因为本插件是基于 SDKWork 通知 API 的浏览器端产品界面；它不注册任何工具、提示词段落或会话事件。

#### KV Cache 影响

无；本插件既不组装也不发送模型请求。

## 已知限制与后续工作

- **未读标记只统计已加载的页面** — 该 API 不提供未读数，因此第一页 `pageSize` 之外的通知在用户加载它们之前不会提升标记。服务端计数操作可以消除这一近似。
- **不自动弹窗** — `showAsPopup` 与 `popupSeen` 会到达客户端，但消息中心从不自行弹出对话框，也从不调用 `popup_seen` 操作。[ui-account-notifications](../ui-account-notifications/README.zh.md) 中的账户通知卡片仍是独立的 DeepSeek 账户通道；刻意打断工作区是一个产品决策，本消息中心不作出该决策。
- **只有已读这一种变更** — 归档、全部已读和删除在此处没有操作；接收用户无法从列表中移除通知。
- **网关必须允许页面源** — 若部署的 CORS 策略不包含该页面源，任何读取之前都会返回 `403`；消息中心随后报告不可用状态。
