# Agent Note: Token Plan 作为组合式客户端模式

Status: implemented

[English](2026-08-17-token-plan-client-mode.md) | 中文

## Problem

BirdCoder 需要一个统一位置，让用户浏览会员套餐、购买或续费套餐、充值 Token Bank 额度并兑换优惠券。这些能力已经由 SDKWork Membership 和 Order 负责，而 BirdCoder 导航和认证属于客户端插件。把 commerce 行为放入 layout，或复制 CloudRouter 路由，都会造成错误的包归属，并让 BirdCoder 耦合到另一个宿主的导航。

## Decision

`@deepseek-ai/dsh-client-ui-token-plan` 负责 `token-plan` 模式、侧栏入口、locale、页面、SDKWork 组合和包 invariant。模式侧栏将其排在普通入口的最后，因此独立固定的 Settings 席位仍然紧邻其下。`AppFrame` 通过带 key 的 `mode.page` slot 渲染页面；React Router 路径和 Settings section 均不参与。

页面复用 Membership 的 `SdkworkSubscriptionCatalogPage`，并注入由 Order 支持的 checkout、recharge 和 coupon 组件。Membership 继续负责目录和套餐行为；Order 继续负责创建支付、查询支付状态、Token Bank 充值和优惠券兑换。

插件根据 `ctx.env.apiBaseUrl()` 创建 Membership 和 Order 客户端。两个客户端共享一个 token manager。已配置的环境 access token 优先于 `ctx.iam` 会话；环境和 IAM 订阅会刷新凭证，环境 URL 变化会使已组合的客户端失效。匿名目录浏览保持可用，需要账户的操作调用 `ctx.iam.openSignIn()`。

SDKWork 普通组件样式以 Token Plan 插件所有权标记内联到客户端 bundle，因此客户端 loader 可以在插件卸载时移除这些样式。

## Alternatives considered

**把 Token Plan 加入 Settings。** Token Plan 是主要应用任务而非配置。Settings section 也无法提供所要求的常驻侧栏入口和模式页面。

**复制 CloudRouter 集成。** BirdCoder 不存在 CloudRouter 专用的钱包路由和重定向。复用 SDKWork 组件和 service port，可以保留其业务归属，而不引入宿主导航。

**在本地实现会员和支付 UI。** 本地副本会重复套餐映射、支付轮询和充值行为，并可能偏离 SDKWork 维护的组件。

## Consequences

BirdCoder 获得一个可独立加载的 commerce 模式，其注册和样式均可撤销。该功能要求已配置 SDKWork API 基础 URL，并需要 Membership 和 Order 的浏览器依赖闭包。BirdCoder 没有独立钱包路由，因此 Token Bank 详情保留在该模式内。
