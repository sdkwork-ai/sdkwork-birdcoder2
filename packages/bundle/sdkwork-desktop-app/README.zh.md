---
description: "The dsh desktop-surface bundle: the Electron patch layer over dsh-base + dsh-web-app plus the desktop surface prompt glue, with the bundle patch declared by the dsh.bundle.patch manifest."
kind: "package-bundle"
---

# @deepseek-ai/dsh-sdkwork-desktop-app

[English](README.md) | 中文

## 概述


dsh 桌面面 bundle:`dsh-base` + `dsh-web-app` 之上的 Electron patch 层,外加桌面面 prompt 粘合(运行时粘合插件默认导出 `@deepseek-ai/dsh-sdkwork-desktop-app`,bundle patch 由 `dsh.bundle.patch` manifest 声明)。应用在 web bundle 之后,该 patch 只替换浏览器载体、不改动 harness 树:`webserver` 行被禁用,由 [`dsh-host-desktop-carrier`](../../host/sdkwork-desktop-carrier/README.zh.md) 行提供由壳层 `app://` 协议处理器驱动的同一个 `webServer` 服务;`web-runtime` 行继续经载体的 fallback seat 挂载前端 dist,但不打印 URL、不注册 web-surface prompt(桌面壳层没有 URL);`connection` 行保持挂载——它的 HTTP 路由注册在桌面载体上是惰性的,而且正是该行把 connection 浏览器半带入 `__DSH_BOOT__` 图;[`dsh-client-connection` 的 `/desktop` 节点半](../../client/connection/README.zh.md)提供 `desktopBridge` host 服务(unary/respond fetch handler + mux/host 事件流),由 Electron 主进程接到 IPC。共享的模块重载 HMR 行保持禁用;桌面壳层的 client-plugin HMR 是后续里程碑。

运行时粘合注册 harness-source prompt 段(与 web 运行时共享)与 `app:desktop-surface` 段,用于给桌面壳层内运行的会话做定位——web bundle 基于 URL 的 surface 文案被禁用,因为壳层没有服务器 URL。

`apps/desktop` 壳层通过 `dsh-app-boot` 加载标准 `web` profile，包括其中的有序组合包、安装在 profile 内的插件和 `profiles/web/cordis.patch.yml`，随后应用 home patch，并把安装自有的 `sdkwork-desktop-app` 组合包作为内存中的传输覆盖层。该覆盖层不会写入 Web profile manifest，因此 `npx @deepseek-ai/dsh web` 与 Electron 共用一份用户组合，同时 Web 启动器不会收到桌面专用行。纯源码组合一致性测试要求每个 Web 行都保持存在且不变，只有 `webserver`、`web-runtime`、`client-hmr` 与 `connection` 允许变化，并把完整的 desktop-only 行集合固定为 `sdkwork-desktop-carrier`、`desktop-connection`、`sdkwork-desktop-app`、`window-controls` 与 `update-banner`。打包启动探针会请求安装后 `clientModules` 图声明的每个客户端 bundle，因此 Electron 包遗漏任何依赖都会使发布冒烟失败。

## 目录

- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 模型体验

### 桌面面 prompt 段

#### 模型看到什么

对于通过桌面壳层创建的会话,`harness:source` 段指明磁盘上的 Harness 实现,`app:desktop-surface` 全局段(order −98)把模型定位到 Electron 窗口:「这个窗口」的指称、没有服务器 URL 与浏览器的事实,以及重建并重载的 client-plugin 契约。web bundle 基于 URL 的 `app:web-surface` 段被 patch 禁用,因此没有任何 URL 或浏览器事实到达模型。

#### Token 效果

每个会话一行 source 与一段 prompt 文案;进程内恒定。

#### KV Cache effect

该段位于系统 prompt 头部附近,且在进程生命周期内保持稳定,因此不会跨轮次使缓存失效。

## Known Limitations and Deferred Work

- **无 client-plugin HMR**——共享 HMR 行被禁用;当前开发循环是重建并重载窗口。
- **无远程访问**——桌面壳层刻意零端口;远程访问是后续里程碑。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

组合一致性测试固定了完整的 desktop-only 行集合(`sdkwork-desktop-carrier`、`desktop-connection`、`sdkwork-desktop-app`、`window-controls`、`update-banner`)与确切的 Web 行差异,因此新增或移除 bundle 行必须在同一次变更中更新该测试。打包启动探针会请求安装后 `clientModules` 图声明的每个客户端 bundle,因此 Electron 包缺失依赖只会在发布冒烟中暴露。

</details>
