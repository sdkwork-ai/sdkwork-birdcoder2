# Agent Note: 桌面退出登录的 OAuth 会话结束端点

Status: implemented

[English](2026-11-22-oauth-session-end-endpoints.md) | 中文

## Problem

桌面登录是 OAuth 公共客户端流程：系统浏览器在部署的 `iamAuthorizeBaseUrl` 上打开托管授权页（`/iam/oauth/authorize`），深链交接再用授权码兑换双 token 会话。退出登录却不属于这个表面：它的浏览器环节打开的是 `<cloudRouterUrl>/auth/sign-out`——CloudRouter 控制台自己的门户 origin，与登录域名不同，因此浏览器落到用户从未登录、也不持有本部署会话的地方，还把 CloudRouter 控制台拖进了产品的认证契约。部署不发布 CloudRouter origin 时，托管会话结束甚至被整体跳过，尽管登录 origin 始终是配置好的。

## Decision

所有托管会话结束 URL 都构建在浏览器登录所用的 origin 上——OEM profile 的 `iamAuthorizeBaseUrl`——且由同一个模块拥有：`packages/client/ui-sdkwork-iam/src/client/oauth-session.ts`。

| 领域 | 端点 | 含义 |
|---|---|---|
| 桌面壳（存在 preload 桥） | `<iamAuthorizeBaseUrl>/oauth/logout?client_id=<clientId>` | 结束该 OAuth 公共客户端的浏览器会话，按授权时提交的 client id 限定 |
| 页面本地会话（纯网页，页面内账号表单） | `<iamAuthorizeBaseUrl>/oauth/sign-out` | 无 OAuth 客户端绑定的托管退出登录页 |

领域判定沿用已经决定登录手势的那个事实：桌面壳以 OAuth 客户端登录，纯网页则渲染页面内表单。client id 来自登录所用的同一次 OEM 读取（`readOemIamClientId() ?? DEFAULT_IAM_CLIENT_ID`），因此登录与注销不可能指向不同的客户端。

浏览器环节始终是建议性的。产品环节自成权威：用 refresh token 调用 IAM app-api 的注销操作（access token 过期后仍然有效）撤销本地会话，并在 `finally` 路径中清空持久副本、内联 SDKWork 凭据与共享 TokenManager。因此浏览器拒绝打开、或托管表面不提供这些端点，都不会让用户停留在已登录状态。`ui-sdkwork-env` 的 `cloudRouterUrl` 只保留「个人主页」的管理中心链接。

本决策取代 [SDKWork 退出登录与「个人主页」设置页](../feature/2026-11-12-sdkwork-sign-out-and-profile-page.zh.md)的浏览器环节；该记录中「确认优先」的手势、本地清理与分区本身不变。

## Alternatives considered

**保留 CloudRouter 托管页。** 用户从未登录的 origin 无法结束登录所创建的浏览器会话，而且让控制台门户成为本产品认证表面的必需部分；未发布 CloudRouter origin 的部署则完全没有浏览器环节。

**打开 `<iamAuthorizeBaseUrl>/auth/sign-out`。** origin 是对的，但该页是共享认证应用的产品路由，而不是登录所用 OAuth 表面的端点。桌面应用仍会依赖某个托管应用的路由表，也没有「页面本地」与「按客户端限定」的区分。

**去掉浏览器环节，只保留服务端撤销。** 撤销能结束产品会话，但授权创建的浏览器会话仍然存活，下一次浏览器登录会跳过账号校验方式——正是「确认优先」的退出登录要消除的缺陷。

**发送 OIDC RP-initiated logout 参数（`id_token_hint`、`post_logout_redirect_uri`、`state`）。** IAM OAuth 服务不签发 `id_token`，也未实现 `nonce` 或 `prompt`，桌面端更没有浏览器回跳目标，因此这些参数要么为空、要么无意义；端点唯一能兑现的绑定就是 client id。

## Consequences

- 托管认证表面必须提供 OAuth 组的 `/oauth/logout` 与 `/oauth/sign-out`。不提供这些端点的部署会打开一个无法结束浏览器会话的页面，而产品会话仍会经 app-api 撤销并在本地清空；包 README 记录了该限制。
- 退出登录不再依赖环境 profile 的 origin。`cloudRouterUrl` 留空只会去掉管理中心链接，而 `IamProfileSnapshot.signOutUrl` 在任何领域都是字符串。
- 端点路径与查询形状集中在同一个模块，部署迁移 OAuth 组时只需改两个常量，不必逐个调用点排查。`oauth-session.client.spec.ts` 锁定 URL，`iam-sign-out.client.spec.ts` 按 OEM 投影锁定两个领域。
