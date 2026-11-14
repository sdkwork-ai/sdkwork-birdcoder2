# Agent Note: Host admission reads the authentication registry outside a nested-service shadow

Status: implemented

[English](2026-11-14-connection-admission-nested-service-shadowing.md) | 中文

## Problem

`HostConnectionService.admit()` 读取 `this.authentication`，而该类同时把同一个实例发布为 `connection.authentication` 嵌套服务。Cordis 会把「与某个嵌套服务同名的服务属性」按**读取方 Context** 重新发布：通过插件的 `connection` 代理读取该属性时，它改为在该插件的 inject 表里解析这个嵌套服务，而不是返回实例字段。于是只 inject 了 `connection`、调用文档化的 `ctx.connection.admit(request)`（或第三方侧边栏使用的 `requestRejection(request)` 包装）的插件会失败：

```
Error: cannot get property "connection.authentication" without inject
    at Proxy.admit (packages/client/connection/lib/index.js:434)
    at Proxy.requestRejection (...)
    at fence (dsh-better-sidebar/lib/index.js)
    at checkAuthAndMutation (sdkwork-dsh-agents/lib/...)
```

这个抛错表现为应用损坏而不是鉴权结果。WebServer 的兜底逻辑会给「handler 失败」的请求回 `400` 且不带响应体，因此 `/sidebar/api/*`、`/sidebar/ws/agent-opens` 升级，以及专家市场的 `/api/michengai/dsh-agency-agents/{sidebar-entry,online-update,composer-recommend}` 全部每次调用都失败，而插件本身仍是 `active`。由于失败点在共享的 admission 路径上，之后任何自行围栏路由的插件都会继承同一个故障。

## Decision

内部 admission 改读 `authenticationRegistry`——这个字段名没有任何 `connection.*` 服务占用，嵌套服务关联因此无法拦截它。`HostConnectionService.authentication` 继续向 inject `connection.authentication` 并通过它注册 provider 的插件发布同一实例；类上的注释说明了两个名字并存的原因。`webserver/authorize` 监听器读取同一个字段，保证 schema 校验与直接 admission 行为一致。

## Alternatives considered

**要求所有调用方 inject `connection.authentication`。** 这与已发布的约定相反：connection 的 README 明确把 `ctx.connection.admit(request)` 记录为 adapter 与第三方插件的入口，`requestRejection` 也是同样的用途。侧边栏是本仓库不修改的只读子模块，专家市场是第三方镜像，因此这个要求只能改动插件生态，而改不动真正持有该实例的服务。

**重命名已发布的字段、另辟凭据入口。** `connection.authentication` 是 `AuthenticationProvider` 注册与「仅凭据校验」的文档化注入面；为了修一个类内部的命名冲突而重命名它，会让无关包里的 provider 一并失效。

**让 WebServer 改回 500 而不是 400。** 这只是保留抛错再换个标签，请求依旧永远拿不到路由自己的鉴权答复。

**在 `admit` 里从定义处 Context 读取 registry。** 服务方法执行时的 receiver 属于调用方，`this.ctx` 是调用方而不是注入该 registry 的 Context；只有字段名能解析到所属实例。

## Consequences

只 inject `connection` 的插件重新拿到文档化的 admission 结果，围栏路由不会再以空 `400` 静默失败。对 inject `connection.authentication` 的插件没有变化——服务关联与 provider 注册表都未被触碰。该类现在用两个名字持有同一实例：一个是对外的关联面，一个是内部读取；`authenticationRegistry` 上的注释记录了原因，避免以后的清理把二者合并。

## Verification

`packages/client/connection/tests/authentication.host.spec.ts` 新增 `admits a request for a plugin that injects only connection`：启动一个只 inject `connection` 的插件，分别调用 `admit` 与 `requestRejection`。没有修复时它以线上同样的报错失败；修复后 admission 返回已注册的 Peer，`requestRejection` 返回 `undefined`。该包测试全绿（`vitest run packages/client/connection/tests`，215 个用例）。在桌面 `--online` 开发通道上，请求日志中 `/sidebar/api/settings.get`、`/sidebar/api/session.phase` 与专家市场三个路由均为 `200`，侧边栏也不再输出 `agent-opens connection failed`。
