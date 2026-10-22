# Agent Note：SDKWork 客户端直接调用环境网关

Status: implemented

[English](2026-10-20-desktop-sdkwork-direct-gateway.md) | 中文

## 问题

Electron 外壳以 `dsh-app://app` 加载 Web 应用，各 SDKWork SDK 客户端（IAM、应用商店、反馈、Drive、知识库、IM REST）会自行在 `ctx.env` 发布的基址后拼接 `/app/v3/api`、`/backend/v3/api` 或 `/im/v3/api` 并发出请求。此前的一次改动把该基址换成外壳 origin，并由 Electron 主进程代理这些前缀，页面因此不再发出跨来源请求。这层间接隐藏了真实网关：知识库调用表现为 `POST dsh-app://app/app/v3/api/knowledge/spaces` 而不是发往环境网关的请求，某个表面无法指向另一台主机，所有 SDK 失败也都报在外壳 origin 上。

## 决策

**所有承载形态都调用其环境 profile 指定的网关。**

- `apiBaseUrl()` 返回活动 profile 的 `apiBaseUrl`，`imApiBaseUrl()` 返回 `imApiBaseUrl`，为空时回退到 `apiBaseUrl`。桌面页面解析出的值与浏览器页面完全一致，因此每个环境保留自己的域名（源码启动也可选用 loopback 地址）。
- 网关把 `dsh-app://app` 登记为第一方 CORS 来源（Web 框架的 `REGISTERED_SDKWORK_DESKTOP_CORS_ORIGINS`，各 topology 文件的 `SDKWORK_CORS_ALLOWED_ORIGINS` 也逐一列出），因此外壳的预检无需代理即可通过。
- Electron 主进程不再服务 SDKWork API 前缀：它只提供打包文档并转发经过认证的 Host 请求。
- IM 嵌入包以 profile 网关作为 `apiBaseUrl`，并据此推导实时 `ws(s)` 来源；宿主不再单独传入 websocket 基址。
- `pnpm desktop:dev` 选择本次启动的目标网关：`--gateway ip`（默认；`localhost` 为别名）配合 `--gateway-port`（standalone 绑定缺省 `3900`）；`--gateway domain` 使用部署域名（可再带端口）；也可直接给出 `host:port` 或绝对 http(s) origin。一次选择会同时写入构建与 Host 的 `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL`、`SDKWORK_BIRDCODER_APP_API_BASE_URL` 与 `SDKWORK_IM_API_BASE_URL`。

## 备选方案

| 否决项 | 原因 |
|---|---|
| 保留同源代理 | 它把 SDK 基址变成外壳内部细节，破坏按环境配置域名，并让桌面承载形态偏离浏览器形态；网关本就信任已登记的桌面来源 |
| 在主进程注入 CORS 头 | 依赖 Chromium 内部实现，而 CORS 策略属于网关 |
| 关闭窗口的 Web 安全 | 会移除所有页面的隔离，而不只是 SDKWork 调用 |
| 为桌面端保留独立 websocket 基址 | 嵌入包已能从网关推导实时来源，第二个事实来源必然漂移 |

## 影响

- 桌面与浏览器流量走同一条路径：每个环境一个 profile 基址，只需在一处修改。
- 源码启动必须启动所选地址对应的网关；`--print-gateway` 会在构建前打印解析后的 origin。
- 自定义 scheme 上现在确实会发生跨来源预检，因此早于「桌面来源登记」的网关会拒绝外壳请求；topology 文件已列出 `dsh-app://app`。
- 知识库表面要求网关内嵌运行时租户与 IAM 登录租户一致（`SDKWORK_KNOWLEDGEBASE_TENANT_ID`，缺省 `1`）。网关的开发 profile 会注入部署租户（`100001`），其他部署也必须设置同一个值；这属于部署配置，与请求如何寻址无关。知识库 app-api 没有按路由的权限校验，该租户下所有已登录用户都可以使用空间。

## 验证

- `apps/desktop/tests/development-gateway.spec.ts`：ip/domain/端口/`host:port` 解析、端口覆盖、被拒绝的选择器，以及环境投影。
- `packages/client/ui-sdkwork-env` 规格：各承载形态都使用 profile 网关、IM 回退与各 tier 缺省值。
- `packages/client/ui-sdkwork-im` 规格：嵌入包以 profile 的 IM 网关作为 `apiBaseUrl`。
- `apps/desktop` 测试：协议处理器只提供打包文档并转发经过认证的 Host 请求。
- `pnpm exec tsc -b tsconfig.client.tests.json` 与 `pnpm exec tsc -b apps/desktop/tsconfig.json`。
