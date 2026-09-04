---
description: "Sdkwork /api 载体扩展：基于已挂载 apiProxy 的特权 /api 分发回退，以及两条服务端到浏览器的 WebSocket 事件下行链，以槽位服务的形式供 connection 主机面消费。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-api-gateway

[English](README.md) | 中文

## 概要

Sdkwork /api 载体扩展的 Node 半。本包提供 `connection` 主机面（`@deepseek-ai/dsh-client-connection`）通过 `src/sdkwork-gateway-slot.ts` 消费的两个槽位服务：`sdkworkApiFallback`，即特权 /api 分发回退，回应 Connection 自有路由不接的请求（环回钉死的特权方法加已挂载的 apiProxy 网关）；以及 `sdkworkEventUpgrades`，即两条服务端到浏览器的 WebSocket 事件下行链。Connection 保留信任围栏与路由注册；面向 apiProxy 的机件由本包持有。

设置槽位间接层的原因：上游的 `file-upload` 主机面引用 Connection 的主机面，而会话控制器又到达 file-upload——若 Connection 在编译期直接引用 apiProxy，`tsc -b` 的项目引用会闭合成环。有了槽位，Connection 的主机面保持无该依赖，面向 apiProxy 的代码留在本 fork 自有包内，上游合并无法与之冲突。

默认导出以 `sdkwork-api-gateway` 插件挂载。它立即提供 `sdkworkApiFallback`（回退按请求惰性读取 apiProxy，缺席时答 404），并在 `apiProxy` 挂载后提供 `sdkworkEventUpgrades`，同时持有下行链套接字的释放权。`./desktop` 子路径是桌面载体的 Node 半：`desktop-connection` 插件注入 Connection 的 `connection` 服务，复用其共享 fetch 处理器与同一回退，并提供 Electron 主进程接线到 IPC 的 `desktopBridge` 宿主服务。

桌面组合（`sdkwork-desktop-app` bundle）同时挂载两行；Web 组合两者都不挂载，因为它不运行 apiProxy，槽位保持未解析——与槽位化之前的惰性行为一致。
