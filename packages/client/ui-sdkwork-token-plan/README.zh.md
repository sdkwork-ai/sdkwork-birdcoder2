# Token Plan

[English](README.md) | 中文

`@deepseek-ai/dsh-client-ui-sdkwork-token-plan` 提供 `token-plan` 应用模式。其侧栏入口是最后一个模式入口，位于独立的 Settings 席位正上方。

页面渲染 SDKWork 会员订阅目录，并组合 SDKWork Order 的结算、Token Bank 充值和优惠券兑换对话框。Membership 负责目录和套餐行为，Order 负责支付和充值操作。

## 运行要求

插件依赖 `ctx.env`、`ctx.iam` 和 `ctx.theme`。它为当前 API 基础 URL 创建 SDKWork 客户端。IAM 会话令牌是已登录结账凭证；环境静态 access token 在 IAM 会话缺少 Access-Token 时补齐，未登录时作为匿名目录凭证。Membership 结账同时需要 Access-Token 和 authToken。环境和 IAM 订阅会刷新凭证，环境 URL 变化会使已组合的客户端失效。页面把 Membership/Order 的 Tailwind 工具类编进插件样式表，用宿主的 light/dark 方案挂上 `.dark` 和 `--sdk-color-*` 令牌，并沿用 Agents Token Plan 的布局（`max-w-7xl` 目录、套餐卡一行四列、深色画布 `#0e0e11`）。匿名用户可以浏览目录，需要账户的操作会打开 BirdCoder 已配置的登录界面。

当前环境必须提供 API 基础 URL，页面才能发起目录或 commerce 请求。配置缺失时，页面会明确提示，而不会隐式选择其他部署。

## Model Experience

无，因为 Token Plan 页面是浏览器侧 SDKWork commerce UI，其业务 HTTP 请求与 Harness 模型请求相互独立。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **需要实时网关**——页面依赖已配置的 SDKWork API 环境以及 Membership 和 Order 网关的实时响应；没有离线目录。
- **无钱包集成**——不提供 CloudRouter 钱包路由或独立的持久化钱包模式。
