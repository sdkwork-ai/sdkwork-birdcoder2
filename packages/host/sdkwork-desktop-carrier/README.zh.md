---
description: "The Electron desktop carrier: the webServer-service-shaped route registry the desktop shell drives from its app:// protocol handler instead of node:http."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-desktop-carrier

[English](README.md) | 中文

## 概述


Electron 桌面载体(默认导出 `DesktopWebServer`,配置 `{host, port}`):由桌面壳层通过 `app://` 协议处理器驱动、而非 node:http 的 `webServer` 形态路由注册表。它不了解任何 harness 概念,也不提供任何文件服务——`register(route)`、`registerFallback(handler)`、`tapIndex(transform)` 与 `applyIndexTaps(html)` 与 Web 载体的注册表保持一致,因此 Web 组合(client-modules 的 bundle 路由与 boot manifest index tap、frontend-static 的 dist fallback、ui-theme 的 index tap)可以原样挂载。`registerUpgrade(route)` 仅用于结构对等,永远不会被分发:桌面壳层的事件流走 IPC,不走 socket。两张表内出现重复路径都会抛错,因为路由模式是组合层契约,冲突即配置错误;每个注册都返回移除自身的 disposer。`host` 与 `port` 仅作信息用途(壳层不开任何 socket);`host` 接受与 Web 载体相同的两个字面量。

`dispatch(request)` 是协议处理器的入口:匹配请求的 pathname(先精确表,再最长前缀,最后 fallback 处理器),以 node:http 形态的 request/response 垫片调用处理器(处理器读取 `req.method`/`req.url`,写入 `res.writeHead`/`res.end`),再把收集到的状态、头与 body 物化为一个 `Response`。无法解析的请求 URL 应答 400;无路由且无 fallback 的请求应答 404;处理器抛错应答 400,若响应头已发出则应答 500,并记录 warning——绝不会让进程退出。

桌面壳层的 `sdkwork-desktop-app` bundle 用本包替换 Web 载体的 `webserver` 行,应用侧的协议注册按请求调用 `dispatch`。本包从不打印;因为没有 URL,所以也没有 URL 行。

## 目录

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## Model Experience

无。本包是 app:// 协议与其它插件注册的路由之间的桌面载体;这里没有任何内容进入模型请求。

#### KV Cache effect

无;本包既不组装也不发送任何 provider 请求。

## Known Limitations and Deferred Work

- **无 HTTP 面**——载体刻意无传输层:桌面壳层的远程访问是后续里程碑,届时会新增真正的 listener,而不是本包。
- **upgrade 注册是惰性的**——`registerUpgrade` 仅为与 Web 载体的接口对等而持有路由;目前没有任何东西分发它们。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

载体不了解任何 harness 概念，也不提供文件服务：它只镜像 Web 载体的路由注册表（`register`、`registerFallback`、`tapIndex`、`applyIndexTaps`），让 Web 组合原样挂载——偏离该注册表形态是跨包变更。任一张表中出现重复路径都按设计抛错，因为路由模式是组合层契约；`registerUpgrade` 仅为接口对等而存在，永远不会被分发。

</details>
