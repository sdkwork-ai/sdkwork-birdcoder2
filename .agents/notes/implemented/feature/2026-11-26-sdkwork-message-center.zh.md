# Agent Note: SDKWork 消息中心接入模式栏

Status: implemented

[English](2026-11-26-sdkwork-message-center.md) | 中文

## 问题

BirdCoder2 原本没有用于 SDKWork 账户通知的产品内收件箱。现有的账户通知界面（`ui-account-notifications`）把 DeepSeek 账户通知作为浮动卡片显示在账户菜单旁；那是另一条后端通道，既没有历史也没有详情视图，也不会展示升级奖励之类的产品通知。CloudRouter 已有参考实现：一个由应用通知 API（`/app/v3/api/notification/notifications`，含列表、确认、弹窗已见）支撑的通知铃铛，已登录的凭据即可访问。用户希望在模式栏设置图标上方提供同样的界面。

## 决策

本 fork 新增 `@deepseek-ai/dsh-client-ui-sdkwork-message-center`（`packages/client/ui-sdkwork-message-center`），作为一个仅浏览器端的插件，贡献两个席位：

- `mode.rail.panel`，id `message-center`，order `20`。面板席位按升序渲染，因此该单元格正好位于设置上方（IM 连接器行 `10` 之下）。它依据共享快照绘制信封字形与未读圆点。
- `shell.overlay`，id `message-center`。仅当共享 UI store 句柄报告打开时渲染浮层，展示状态块、按日分组的列表和就地详情视图。

快捷入口与浮层使用同一个 `createMessageCenterUiStore()` 句柄注册，因此点击的打开动作与浮层渲染的状态不可能互相矛盾。插件的 `MessageCenterService` 负责快照（状态、条目、未读数、是否还有下一页、失败）、轮询与乐观确认；通知服务负责可见性、排序与消费。

传输层使用共享的 `@sdkwork/sdk-common` HTTP 客户端：它从 IAM 会话的令牌三元组注入双令牌请求头（`Access-Token`、`Authorization: Bearer`），在会话缺少访问令牌时回退到环境的静态访问令牌，解包 `{ code, data, traceId }` 信封，并抛出带类型的失败。请求有意省略 `app_id`：平台从凭据推导应用上下文，并以 `400` 拒绝客户端自带的上下文选择器。页面条目在传输边界校验；不可用的行会被跳过并记录诊断，因此相邻的有效行仍会渲染。`pageInfo.hasMore` 或 `page < totalPages` 驱动加载更多行。失败会分类为 `unauthorized`（清空未读标记并提供应用内登录手势）、`unavailable`（重试状态）与 `unknown`；后续失败会在缓存页之上保留重试横幅。

`pollIntervalMs`（默认 `60000`）与 `pageSize`（默认 `20`，API 范围 1–200）是 volatile 配置字段，因此 `cordis.yml` 的修改会在下一次读取时到达已打开的页面，无需重新挂载插件。

## 考虑过的替代方案

- **复用 `ui-account-notifications` 卡片。** 它们读取 DeepSeek 账户通道，从不读取 SDKWork 应用通知服务，也无法呈现历史或完整正文。复用它们无法满足本产品所需的通知来源。
- **把消息中心做成应用模式。** 模式页面会替换工作区并新增一个模式栏条目；而需求的界面是由图标唤起的聚焦列表。浮层保留工作区，也不改动模式栏的模式词汇。
- **通过 Host 服务代理读取。** 本 fork 的每个 SDKWork 功能都已用会话凭据从浏览器调用应用 API 网关，桌面外壳本身也是注册过的第一方 CORS 源。增加 Host 跳转会引入新的线上契约并重复凭据处理，却不改变可达性。
- **为 `showAsPopup` 通知自动弹窗。** 打断正在运行的任务是一项产品决策，而不是传输层缺失；该字段被携带但未使用，并已在限制中记录。
- **手写 `fetch`。** 共享的 SDKWork 客户端已经实现双令牌请求头、信封解包与带类型错误；第二份实现只会多出一份需要同步的契约。

## 影响

- 模式栏在设置正上方新增一个 44px 单元格；面板排序保持显式（order `20` 位于 IM 连接器的 `10` 之下）。
- 未读标记只统计已加载的页面，因为该 API 不提供计数操作；这被记录为限制，而不是用第二个接口去近似。
- 浮层的日期分组由新到旧，未带时间的通知排在最后；打开通知会通过确认操作把它标记为已读，写入是乐观的。
- 部署必须在网关的 CORS 策略中允许页面源；未注册的源在任何读取之前就会返回 `403`，消息中心会将其报告为不可用。
- 验证：包内测试覆盖线上契约、以桩替换 `fetch` 的传输层、服务生命周期、两个组件，以及基于真实传输层的 apply 装配（`packages/client/ui-sdkwork-message-center/tests/`）。
