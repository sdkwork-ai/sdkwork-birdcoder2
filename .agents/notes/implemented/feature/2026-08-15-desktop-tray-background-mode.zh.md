# Agent Note: 桌面系统托盘——后台运行、会话快捷跳转与关闭到托盘

Status: implemented

[English](2026-08-15-desktop-tray-background-mode.md) | 中文

## Problem

桌面壳层在窗口关闭时直接退出：承载后台 Agent 运行的 harness 宿主进程随窗口一起终止，用户也只能打开完整窗口才能进入会话。需求是增加后台进程运行模式：一个系统托盘图标（Windows 通知区域、macOS 菜单栏、Linux AppIndicator/StatusNotifier），点击即可打开应用，右键菜单列出最近会话以便快捷跳转，并按各平台原生习惯对齐专业托盘产品的行为。

## Decision

桌面壳层支持后台运行并暴露带会话菜单的系统托盘，由应用主进程持有：

- **`apps/desktop/src/tray.ts`** —— `installTray()` 用随包分发的 `build/icon.png`（macOS 上缩放到 18x18）创建 `Tray`，设置 tooltip，消费实时的 `desktop` 设置命名空间，从 `ctx.sessionQuery` 读取最近会话（`listSessions()` + `readTitleSnapshots()`，先过滤子代理子会话与未命名/空白会话，再取最多 8 条），并构建菜单模板：打开 / 新建会话 / 带相对时间副标签的最近会话 / 检查更新 / 退出。平台接线遵循各自系统约定：macOS 与 Linux 点击即弹出菜单（macOS 每次点击弹新菜单；Linux 设置静态上下文菜单并在窗口聚焦/显示时及 30 秒间隔刷新——AppIndicator 不派发点击事件），Windows 与其他平台左键/双击显示窗口、右键弹出新鲜菜单。
- **`apps/desktop/src/main.ts` 中的后台模式** —— 关闭到托盘开启且未处于退出流程时，窗口的 `close` 事件改为隐藏到托盘而非关闭；后台模式激活时 `window-all-closed` 不再退出（macOS 应用按惯例也保持存活）；`second-instance` 与 macOS `activate` 事件重新显示隐藏窗口。托盘的"退出"项设置退出标志并调用 `app.quit()`，走既有的先释放后退出流程。
- **托盘 → 渲染进程的 IPC 导航** —— 新增两个单向通道 `dsh:open-session`（`{ sessionId }`）与 `dsh:new-session`，主进程先推送再显示窗口；preload 在权威 `DesktopBridge`（`dsh-client-connection`，应用侧 `bridge-types.ts` 结构镜像）上暴露 `onOpenSession(listener)` / `onNewSession(listener)`。
- **客户端插件**（`packages/client/ui-sdkwork-window-controls`，桌面壳层 chrome 插件）现在同时路由托盘导航：`onOpenSession` 打开目标会话——当 id 不在渲染进程列表镜像中时先经 `sessions.refresh()` 重拉基线，因为托盘列出的是整个宿主语料；`onNewSession` 复用共享的 `workspaces.startSession()` 动作。同一插件把"关闭窗口时最小化到托盘"偏好行注册进通用设置（`settings.general.item`，id `desktop-tray`），通过 `ctx.settingsScope` 绑定 `desktop` 设置命名空间；宿主侧注册随主进程的托盘模块一起存在。
- **`ISessions` 扩展** —— 对外会话面（`dsh-client-runtime`）新增 `refresh(): Promise<void>`，由 `SessionRuntime` 与 fixture 双件 `TestSessions` 实现；托盘的打开会话路径是当前消费者。

## Alternatives considered

| 已拒绝 | 一句话理由 |
|---|---|
| 通过 bridge 调宿主 `/api/session.list` RPC 供菜单使用 | `ctx.sessionQuery` 是同一份 live-preferred 语料，且从持有宿主树的进程直接、类型安全地调用，无需构造/解析线上信封 |
| 所有平台都用 `setContextMenu` | macOS 与 Windows 此后无法在每次交互时弹出刚构建的菜单；按次弹出让会话保持新鲜而无需刷新机制，Linux（唯一必须用 set 菜单的平台）则有显式刷新路径 |
| 为托盘导航新建独立客户端插件包 | 桌面壳层 chrome 插件已持有 preload 表面；一个约 30 行的监听器不值得新增包骨架与 bundle 注册 |
| 把"关闭到托盘"存进 Electron `userData` 的 JSON 文件 | 产品自身的设置能力（`ctx.settings` + 通用设置界面）已持久化用户偏好并在 UI 中呈现 |

## Consequences

默认情况下关闭窗口后 harness 继续在后台运行（托盘图标与 tooltip 使其可被发现），托盘菜单无需打开窗口即可直接进入会话或新建会话。Web GUI 不受影响：新 IPC 通道在桌面 preload 之外无效果，插件托盘路由以 bridge 表面为守卫，设置行绑定的命名空间只有桌面壳层注册。代价：Linux 上常驻的 30 秒刷新间隔会重建一个至多约 13 项的菜单（可忽略）；托盘会话列表按创建时间排序（语料顺序）而非最近活跃时间；关闭到托盘默认开启，关闭窗口的用户需要从托盘、Cmd/Ctrl+Q 或设置开关退出；打包产物需要为主进程与客户端的新 bundle 重新构建。

## Testing

`apps/desktop/tests/tray.spec.ts` 覆盖菜单模板与动作、更新回调接线、会话加载（先过滤子代理/未命名项再取上限）、设置 schema 默认值与实时观察，以及 mock 掉 `Tray`/`Menu`/`nativeImage` 后各平台的点击接线。`packages/client/ui-sdkwork-window-controls` 在逐文件 100% 覆盖门槛下覆盖托盘路由（已列/未列/缺失 id 路径、teardown）与设置行（store 镜像、写回路由、scope 状态）；`TestSessions.refresh()` 由 test-support runtime 规格钉住。
