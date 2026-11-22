---
description: "Sdkwork /api 载体扩展：基于已挂载 apiProxy 的特权 /api 分发回退，以及两条服务端到浏览器的 WebSocket 事件下行链，以槽位服务的形式供 connection 主机面消费。"
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-api-gateway

[English](README.md) | 中文

<a id="summary"></a>
## 概述

Sdkwork /api 载体扩展的 Node 半，即 `connection` 主机面消费的两个槽位服务。`sdkworkApiFallback` 回应 Connection 自有路由不接的 /api 请求——环回钉死的特权方法加已挂载的 apiProxy 网关；`sdkworkEventUpgrades` 持有两条服务端到浏览器的 WebSocket 事件下行链。Connection 保留信任围栏与路由注册；面向 apiProxy 的机件由本包持有，缺了它整个 apiProxy 域都会答 404。

## 目录

- [概述](#summary)
- [开发备注](#dev-note)

## 理解实现

设置槽位间接层的原因：上游的 `file-upload` 主机面引用 Connection 的主机面，而会话控制器又到达 file-upload——若 Connection 在编译期直接引用 apiProxy，`tsc -b` 的项目引用会闭合成环。有了槽位，Connection 的主机面保持无该依赖，面向 apiProxy 的代码留在本 fork 自有包内，上游合并无法与之冲突。

默认导出以 `sdkwork-api-gateway` 插件挂载。它立即提供 `sdkworkApiFallback`（回退按请求惰性读取 apiProxy，缺席时答 404），并在 `apiProxy` 挂载后提供 `sdkworkEventUpgrades`，同时持有下行链套接字的释放权。`./desktop` 子路径是桌面载体的 Node 半：`desktop-connection` 插件注入 Connection 的 `connection` 服务，复用其共享 fetch 处理器与同一回退，并提供 Electron 主进程接线到 IPC 的 `desktopBridge` 宿主服务。

web-app bundle 同时挂载两行——渲染器在每个载体上都说 apiProxy 线上方言，缺了它们整个 apiProxy 域（workspace.list、host.describe、host.openPath、…）都会答 404。桌面载体的 overlay 保留该 bundle 挂载的行，只用 `nativeOpen: true` 覆盖 apiproxy 行；残留的 `sdkwork-desktop-app` bundle 仍插入同样的行，但已无人加载它。

<a id="dev-note"></a>
## 开发备注

回退按请求惰性读取 apiProxy，因此 connection 主机面对 apiProxy 包不产生编译期引用（`tsc -b` 项目引用不成环）；桌面半部通过 `./desktop` 子路径复用同一回退。

<a id="model-experience"></a>
## Model Experience

无，因为本包只在浏览器与宿主之间分发 /api 请求与事件升级；它不注册任何工具、prompt 段或 Session 事件。

#### KV Cache effect

无；本包既不组装也不发送提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **没有 apiProxy 行就没有载体**——apiProxy 行缺席时 `sdkworkApiFallback` 对整个 apiProxy 域答 404，而 `sdkworkEventUpgrades` 要等 `apiProxy` 挂载后才提供，因此在它之前不会打开任何事件下行链。
- **回退只服务环回调用方**——特权 /api 分发只接受环回钉死的方法加已挂载的 apiProxy 网关；远程浏览器能否访问是 Connection 信任围栏的决定，不属于本包。
- **桌面半部原样复用 Web 回退**——`./desktop` 注入 Connection 的 `connection` 服务并经 IPC 接同一回退，因此回退行为的改动必须同时落到两个面。
