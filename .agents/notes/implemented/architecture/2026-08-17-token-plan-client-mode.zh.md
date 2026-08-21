# Agent Note: Token Plan 作为组合式客户端模式

Status: implemented

[English](2026-08-17-token-plan-client-mode.md) | 中文

## Problem

BirdCoder 需要一个统一位置，让用户浏览会员套餐、购买或续费套餐、充值 Token Bank 额度并兑换优惠券。这些能力已经由 SDKWork Membership 和 Order 负责，而 BirdCoder 导航和认证属于客户端插件。把 commerce 行为放入 layout，或复制 CloudRouter 路由，都会造成错误的包归属，并让 BirdCoder 耦合到另一个宿主的导航。

## Decision

`@deepseek-ai/dsh-client-ui-sdkwork-token-plan` 负责 `token-plan` 模式、侧栏入口、locale、页面、SDKWork 组合和包 invariant。模式侧栏将其排在普通入口的最后，因此独立固定的 Settings 席位仍然紧邻其下。`AppFrame` 通过带 key 的 `mode.page` slot 渲染页面；React Router 路径和 Settings section 均不参与。

页面复用 Membership 的 `SdkworkSubscriptionCatalogPage`，并注入由 Order 支持的 checkout、recharge 和 coupon 组件。Membership 继续负责目录和套餐行为；Order 继续负责创建支付、查询支付状态、Token Bank 充值和优惠券兑换。

插件根据 `ctx.env.apiBaseUrl()` 创建 Membership 和 Order 客户端。来自 `ui-sdkwork-iam` 的浏览器全局 token manager 同时服务这两个客户端以及其余每个 SDKWork 插件。IAM 会话令牌是已登录结账凭证；环境静态 access token 在 IAM 会话缺少 Access-Token 时补齐，未登录时作为匿名目录凭证。Membership 结账同时需要 Access-Token 和 authToken，因此已登录下单会在会话没有 access token 时把 IAM `authToken` 与环境 access token 合并。环境和 IAM 订阅会刷新凭证，环境 URL 变化会使已组合的客户端失效。宿主结账对话框的组件身份在 locale 刷新时保持稳定，避免 `createPayment` 因重挂载被中止。匿名目录浏览保持可用，需要账户的操作调用 `ctx.iam.openSignIn()`。

SDKWork 目录和对话框样式从 Membership、Order 与 ui-pc-react 的 Tailwind 源编译，并以 Token Plan 插件所有权标记内联。页面挂载 `SdkworkThemeProvider`（`tech-blue`，宿主 `themeSelection`），使 `--sdk-color-*` / `--theme-primary-*` 与 `html.dark` 与 membership-pc 一致：目录的 `dark:` 工具类和 portal 到 body 的 Order 对话框跟随宿主配色。编译结果不含 Tailwind preflight；仅在 `[data-token-plan-surface]` 下做 scoped reset。目录包装器 `[data-token-plan-catalog]` 把 Membership 套餐卡固定为一行四列，不依赖视口上的 `lg:grid-cols-4`。Light mode 会重映射写死为暗色的算力充值对话框。客户端 loader 因此可以在插件卸载时移除这些样式。

## Alternatives considered

**把 Token Plan 加入 Settings。** Token Plan 是主要应用任务而非配置。Settings section 也无法提供所要求的常驻侧栏入口和模式页面。

**复制 CloudRouter 集成。** BirdCoder 不存在 CloudRouter 专用的钱包路由和重定向。复用 SDKWork 组件和 service port，可以保留其业务归属，而不引入宿主导航。

**在本地实现会员和支付 UI。** 本地副本会重复套餐映射、支付轮询和充值行为，并可能偏离 SDKWork 维护的组件。

## Consequences

BirdCoder 获得一个可独立加载的 commerce 模式，其注册和样式均可撤销。该功能要求已配置 SDKWork API 基础 URL，并需要 Membership 和 Order 的浏览器依赖闭包。BirdCoder 没有独立钱包路由，因此 Token Bank 详情保留在该模式内。
