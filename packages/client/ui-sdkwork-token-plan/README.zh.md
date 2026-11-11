---
description: "Token Plan application mode: the SDKWork membership subscription catalog page composing Order checkout, Token Bank recharge, and coupon redemption dialogs."
kind: "package-reference"
---

# Token Plan

[English](README.md) | 中文

## 概述


`@deepseek-ai/dsh-client-ui-sdkwork-token-plan` 提供 `token-plan` 应用模式。其侧栏入口是最后一个模式入口，位于独立的 Settings 席位正上方。插件同时提供设置菜单的账号钱包卡（`settings.menu.plan`）：显示已登录账号的套餐名与算力积分余额，数据与页面读同一套 Membership 服务；升级套餐/购买积分操作会打开该模式。同一服务还支撑设置中心的「套餐与积分」分区（`settings.section` id `points`）：可用/冻结积分拆分、最近积分流水、概览进度条与升级入口。

页面渲染 SDKWork 会员订阅目录，并组合 SDKWork Order 的结算、Token Bank 充值和优惠券兑换对话框。Membership 负责目录和套餐行为，Order 负责支付和充值操作。

## 目录

- [运行要求](#runtime-requirements)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 运行要求

插件依赖 `ctx.env`、`ctx.iam` 和 `ctx.theme`。它为当前 API 基础 URL 创建 SDKWork 客户端。IAM 会话令牌是已登录结账凭证；环境静态 access token 在 IAM 会话缺少 Access-Token 时补齐，未登录时作为匿名目录凭证。Membership 结账同时需要 Access-Token 和 authToken。环境和 IAM 订阅会刷新凭证，环境 URL 变化会使已组合的客户端失效。页面把 Membership/Order 的 Tailwind 工具类编进插件样式表，用宿主的 light/dark 方案挂上 `.dark` 和 `--sdk-color-*` 令牌，并沿用 Agents Token Plan 的布局（`max-w-7xl` 目录、套餐卡一行四列、深色画布 `#0e0e11`）。匿名用户可以浏览目录，需要账户的操作会打开 BirdCoder 已配置的登录界面。

算力积分购买、积分余额和兑换三个对话框采用 BirdCoder 自己的模态外观。积分余额和兑换使用 ui-primitives `Modal`；Order 拥有的充值对话框保留原有行为，其 SDKWork 调色板在 `pointsRechargeTheme.css` 中改指向 `--dsw-*` 语义别名。这些别名随 `body[data-ds-dark-theme]` 翻转，因此三个对话框在两种配色下都跟随外观设置，无需 light/dark 分支。

充值下单与兑换码核销属于用户发起的写操作，需要 IAM 会话。`TokenPlanService` 用 `requireSignedInInPlace()` 把它们挡在登录之后：应用内登录浮层盖在当前对话框之上，不会离开工作区去打开桌面欢迎页；支付界面保持在场，登录完成后同一个请求带着新凭据继续执行。用户关闭登录浮层时，界面给出本地化的 `commerce.signInRequired` 提示，而不是网关的 Bearer Token 报错。

当前环境必须提供 API 基础 URL，页面才能发起目录或 commerce 请求。配置缺失时，页面会明确提示，而不会隐式选择其他部署。

## Model Experience

无，因为 Token Plan 页面是浏览器侧 SDKWork commerce UI，其业务 HTTP 请求与 Harness 模型请求相互独立。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **需要实时网关**——页面依赖已配置的 SDKWork API 环境以及 Membership 和 Order 网关的实时响应；没有离线目录。设置菜单的钱包卡同样如此：未登录时不渲染，摘要读取失败时显示重试。
- **无钱包集成**——不提供 CloudRouter 钱包路由或独立的持久化钱包模式。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

IAM 会话令牌是结账凭证；环境静态 access token 只在 IAM 会话缺少 Access-Token 时补齐，未登录时作为匿名目录凭证，而 Membership 结账同时需要 Access-Token 和 authToken。API 基础 URL 缺失时页面响亮失败，而不会隐式选择其他部署。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；token-plan 界面从所属控制器读取权威的用量与套餐事实并做无状态渲染；刷新一致性直接由本包的客户端行为规格测试覆盖。
