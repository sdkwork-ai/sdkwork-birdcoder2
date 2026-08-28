# Agent Note: Electron 桌面壳层——IPC fetch 载体与桌面载体替换

Status: implemented

[English](2026-08-14-desktop-shell-ipc-carrier.md) | 中文

## Problem

[GUI 分层与 RPC 协议说明](../../archived/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)为 Electron 壳层预留了"以 IPC fetch 载体复用 web 客户端包"：`AbstractApiClient` 子类表里写着"IPC bridge subclass"但背后没有壳层，webserver README 声明该服务器只服务浏览器，而四象限 RPC 协议刻意与信道解耦，让新载体无需改动契约即可替换。这个预留需要一个具体实现：一个与 `dsh web` 启动同一棵 harness 树、零网络端口的桌面应用，从本地壳层提供构建好的前端与插件 bundle，并经由 IPC 承载 RPC。

## Decision

桌面壳层是 `apps/desktop`（`@deepseek-ai/dsh-desktop`，Electron）：它通过 CLI 所用的同一套 `dsh-app-boot` 机制在进程内启动标准 `web` profile，随后把安装自有的 `@deepseek-ai/dsh-sdkwork-desktop-app` 组合包作为运行时覆盖层应用，但不写入 profile manifest。Harness home 可在测试中替换，模块回退修复同时覆盖安装内容与 profile-local 插件。三块实现载体替换：

- **桌面载体**（`packages/host/sdkwork-desktop-carrier`，`@deepseek-ai/dsh-sdkwork-desktop-carrier`）：由 `dispatch(request)` 而非 node:http 驱动的 `webServer` 服务形态的 route/fallback/index-tap 注册表。`sdkwork-desktop-app` bundle patch 禁用 HTTP `webserver` 行并插入本行，于是 client-modules（插件 bundle 路由 + boot manifest index tap）、frontend-static（dist fallback）、ui-theme（index tap）与 web-runtime 原样挂载。Electron 主进程把 `app://` scheme 注册为特权（standard、secure、支持 fetch、CORS、stream），并把针对单一 `app://dsh` origin 的每个请求都路由到载体的 dispatch——dispatch 以 node:http 形态的 request/response 垫片调用处理器（处理器读取 `req.method`/`req.url`，写入 `res.writeHead`/`res.end`；垫片把收集到的响应物化为 Response）。
- **IPC 桥接**（`dsh-client-connection` 新增的 `/desktop` 节点半，`src/desktop.ts`）：提供 `desktopBridge` host 服务——由 web 节点半的 `HostConnectionService.createSharedFetchHandler` 叠在共享的 `createApiGatewayFetch`（含特权方法钉死）之上构建的 unary/respond fetch handler，外加 `api.events.mux`/`host` 开启器。web `connection` 行保持挂载：它的 `/api` route 与 WebSocket upgrade 注册落在桌面载体上且保持惰性，而正是该行把 connection 浏览器半带入 `__DSH_BOOT__` 图——禁用它就会移除渲染进程的线路客户端。主进程把 `ipcMain.handle('dsh:rpc'|'dsh:subscribe')` 与 `webContents.send('dsh:frame'|'dsh:stream-end')` 接到桥接上，并把渲染进程的每个请求归一化到回环权威（这正是 /api 栅栏授予同源回环页面的信任的桌面等价物）。
- **渲染进程客户端**（`dsh-client-connection` 的浏览器半）：connection 插件的 apply 依据 preload 暴露的 `window.desktopBridge` 选择载体——存在 → `IpcApiClient`（`AbstractApiClient` 子类，其 `doFetch` 走 bridge 的 JSON 往返，`openMux`/`openHost` 走按订阅下行的回调）外加 `createIpcConnectionRpc`；`?fixture` → fixture；否则为 WebSocket 版 `WebApiClient`。选中的 IPC 载体还会让 `ctx.connection.isLoopback` 为 true，不受 `app://dsh` hostname 影响：preload bridge 标识本地进程内载体，而 `WebApiClient` 继续按当前页面 hostname 判定。客户端 settings scope 与原生操作控件因此会暴露与回环 web 页面相同的仅限本地操作。沙箱 preload（`apps/desktop/src/preload`）只用 `contextBridge` 与 `ipcRenderer` 暴露 bridge。

壳层窗口使用 `contextIsolation: true`、`nodeIntegration: false` 与 `sandbox: true`；preload 是单个 CJS 产物（沙箱 preload 不能是 ESM）。会话持久化在标准 Harness home（`$DSH_HOME` 或 `~/.dsh`）下，与 CLI 与 web 面共享数据。退出前通过与 CLI 相同的受限 shutdown 控制器模式 dispose 整棵 host 树。

打包（electron-builder，`apps/desktop/electron-builder.yml` 与发布 workflow `.github/workflows/desktop-release.yml`）刻意关闭 `asar`：host 用 junction/symlink 治愈每个 profile 的模块回退，链接目标必须是真实目录，而 asar 归档是一个文件，因此打包布局是真实的 `resources/app/` 目录。应用的 `dependencies` 声明**完整运行时闭包**——electron-builder 只收集已声明的依赖，而 harness 的 Service Definition 包是实现包的 peer，所以每个可达 peer 都必须显式列出；`apps/desktop/scripts/sync-pack-deps.mjs` 计算并同步该清单（CI 以 `check:pack-deps` 校验）。应用还装配自己的 shipped agent-preset 名册（`apps/desktop/config/agent-presets`，打进应用）：web 组合的 `agent-presets` 行默认 `standard`，没有 system 信任的 root 该默认就解析不到任何东西，于是每次 `session.create` 都会失败——桌面 host 与 CLI 的 profile boot 一样注入 shipped root。发布 workflow 在三个平台构建、打包 Windows NSIS / macOS dmg+zip / Linux AppImage 安装包，并用 `apps/desktop/scripts/packaged-boot-probe.cjs` 以全新 home 对每个打包产物做冒烟。该探针请求每个已声明的客户端 bundle、创建会话、检查配置 namespace、设置客户端与提供方目录，写入插件、模型和凭据设置，拒绝凭据值出现在 `settings.yaml`，并在重启后读取配置与不含值的凭据状态。

## Alternatives considered

| 已拒绝 | 一句话理由 |
|---|---|
| 以 `file://` 加载 dist，manifest 由 preload 注入 | 构建出的 index.html 使用绝对资源路径，且 file 页面限制 fetch；`app://` 协议让 index 走载体既有的 tap 管线（boot manifest 注入），并统一应答所有相对资源与 bundle URL |
| 用全新实现的桌面桥接替换 web 节点半 | 复用 `HostConnectionService` + `createApiGatewayFetch` 让通用 RPC 通道、interceptor 与特权钉死留在唯一的 connection 服务实例上；平行实现会重复钉死与 interceptor 路由 |
| 在桌面 patch 中禁用 web `connection` 行 | 该行把 connection 浏览器半带入 boot 图；禁用它移除了渲染进程的线路客户端，令所有客户端条目都停在等待 `connection` |
| 把 `app://dsh` 当作回环 hostname | 这会把连接信任决策绑定到单一 shell scheme，还可能把 `WebApiClient` 页面判作本地；所选 IPC 载体才是权威事实 |
| 给桌面载体自带 HTTP 服务器 | 壳层刻意零端口；远程访问是带独立 listener 的后续里程碑 |

## Consequences

web GUI 与桌面壳层运行完全相同的 harness 树与线路契约；载体替换只触及 connection 包的 apply、一个新节点半入口、一个新 host 包与应用自身的接线——协议零改动、无新 DTO 集、web 行为不变（浏览器仍选择 `WebApiClient`）。桌面面以桌面-surface prompt 替代基于 URL 的 web-surface prompt，模型看不到服务器 URL。一条完整装配的跨载体回归让桌面 IPC host、HTTP Web host 与重启后的桌面 host 使用同一个 Harness home；它要求设置客户端包集合、配置 namespace 与提供方目录一致，证明设置和凭据改动可双向读取，并拒绝任何落在 `settings.yaml` 而非 `.credentials.yaml` 的 API Key 字面值。代价：新增一个 host 包与一个 bundle，其 invariant 与 README 需要维护；载体的 node:http 形态垫片边界（在其单一 cast 点文档化）；client-plugin 的 dev 模式 HMR 未接线（改为重建+重载窗口）；沙箱 preload 必须保持 CJS；组合测试要求已构建的工作区（在干净树上自跳过，与无 key 快照通道同一契约）。
