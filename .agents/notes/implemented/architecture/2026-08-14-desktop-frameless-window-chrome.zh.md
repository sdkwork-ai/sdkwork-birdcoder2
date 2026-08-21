# Agent Note: 无边框桌面窗口——自绘窗口控件与拖拽区

Status: implemented

[English](2026-08-14-desktop-frameless-window-chrome.md) | 中文

## Problem

[桌面外壳笔记](2026-08-14-desktop-shell-ipc-carrier.md)交付的 Electron 窗口带原生边框：操作系统标题栏、默认的 Electron 应用程序菜单（File/Edit/View/…）与系统窗口控件。外壳能工作，但 chrome 不像现代桌面应用：菜单行占用了应用从不使用的纵向空间，标题栏是死的，控件和其他所有窗口一样放在那里——这些都不属于产品自己的设计语言。需求是把窗口 chrome 画进产品 UI：去掉默认菜单与系统标题栏，并在应用右上角、Session-log 工具右侧，用原生实现（不依赖任何窗口或图标库）绘制自定义的最小化/最大化/关闭控件。

## Decision

桌面窗口改为无边框、无菜单，渲染端拥有右上角 chrome：

- **`apps/desktop` 主进程**：`Menu.setApplicationMenu(null)` 为所有窗口移除默认菜单；`BrowserWindow` 使用 `frame: false`（Windows 的边缘缩放保持原生——Electron 处理不可见边框），并保留 `sandbox: true` / `contextIsolation: true` / `nodeIntegration: false`。`maximize`/`unmaximize` 事件把实时状态经 `dsh:window-maximized` 转发给渲染端，切换字形永远不会过期（键盘吸附、拖拽区双击）。
- **窗口 IPC**（在 RPC 通道之外新增）：`dsh:window-action`（渲染端 → 主进程，即发即弃：`minimize` | `toggle-maximize` | `close`，经 `BrowserWindow.fromWebContents(event.sender)` 路由）、`dsh:window-state`（invoke → `{ maximized }`）、`dsh:window-maximized`（主进程 → 渲染端，布尔）。preload 暴露 `window.desktopBridge.windowControls`——`minimize` / `toggleMaximize` / `close` / `isMaximized` / `onMaximizedChanged`——作为 `dsh-client-connection` 权威 `DesktopBridge` 类型的**可选**成员（在应用自己的 `bridge-types.ts` 中做结构镜像）。
- **客户端插件**（`packages/client/ui-sdkwork-window-controls`，`@deepseek-ai/dsh-client-ui-sdkwork-window-controls`）：纯展示按钮簇（三个按钮、内联 SVG 字形、仅用 token 的 CSS、中文 aria 文案），由两处注册共同安排，两者都经由 `slots.inject` 跟随声明方生命周期：
  - `shell.overlay` 持有唯一的可交互按钮簇，并在新建会话 hero、会话页头和详情面板等状态下把它钉在窗口右上角；
  - `conversation.session.header.utilities`（order 100，位于 Session-log 工具右侧）只保留对应平台的按钮簇宽度，不挂载另一组按钮。因此详情列宽度不会移动窗口控件；详情页头读取 overlay 提供的各平台 `--dsh-window-controls-details-right` 留白，使自己的关闭操作不会与窗口控件重叠。两处注册只存在于 `dsh-desktop-app` bundle 补丁中（外加 bundle 与应用自身的依赖闭包），web 组合永远不会加载该插件；preload 表面缺失时（fixture 模式、意外名单），两个占位者都渲染为空。
- **平台尺寸**：渲染端把宿主平台映射为独立的 CSS 尺寸，而不是共享一个边距：Windows 使用 45x32px、贴合边缘的命中区与 12px 字形；Linux 使用 34px 控件、16px 符号字形、3px 组间距、顶部 6px 与右侧 7px 留白；macOS 使用 28px 紧凑控件、12px 字形以及顶部和右侧 12px 留白；未知宿主使用紧凑 12px 字形和 8px 留白。产品在每个平台都保留右上角自绘按钮簇；原生 macOS traffic lights 与专用缩放语义不属于这个以 Windows 为先的 UI。
- **发布矩阵**：`apps/desktop/electron-builder.yml` 只定义各平台的打包目标，不固定架构；`.github/workflows/desktop-release.yml` 为每个平台 job 传入一个明确架构。因此每份 artifact 与 packaged-boot probe 都只覆盖一个架构。
- **拖拽区**：会话页头的标题行是窗口拖拽区（`ui-conversation` 模块 CSS 中 `.titleRow` 用 `-webkit-app-region: drag`，其按钮/链接/输入用 `no-drag`——在 web 上无效，浏览器忽略该属性）；浮动条带自带拖拽区，按钮簇在其内重新进入指针事件。双击任一拖拽区都会原生最大化/还原。

## Alternatives considered

| 被否决方案 | 一句话理由 |
|---|---|
| `titleBarStyle: 'hidden'` + 原生 `titleBarOverlay` | 覆盖层画的是 OS 自己的控件；需求明确是自绘控件，原生覆盖层既不能改样式也不能放到 Session log 旁边 |
| 保留默认应用菜单并 `autoHideMenuBar` | 它仍会闪现菜单行（Alt 可唤出），且没有任何产品 UI 用得上的东西；需求是彻底移除菜单 |
| 在页头上方加一条常驻标题栏条带 | 需求的位置是 *Session log 右侧*、同一行；独立条带会放在它上方，而页头右端本就是窗口右上角 |
| 只在页头里渲染控件 | 页头在 hero 态（无会话/空白会话）是隐藏的；第一条消息之前窗口将无法关闭——因此才由 `shell.overlay` 锚定整个窗口 |

## Consequences

桌面外壳现在像产品本身，而不是默认的 Electron 窗口：没有菜单行，没有系统标题栏，锚定窗口边缘的自定义控件在所有外壳状态下都可用。web GUI 完全不受影响——拖拽区 CSS 在那里无效，插件也不会加载。主进程新增三个 IPC 通道与一个 preload 表面；`dsh-client-connection` 的 `DesktopBridge` 增加一个可选成员（连接插件及其测试不受影响）。代价与暂缓事项：Windows 11 吸附布局浮层随原生最大化按钮一起消失（吸附仍可通过拖到顶部、Win+方向键与自定义按钮完成）；macOS 无边框边缘缩放随 macOS 构建推迟；拖拽区跟随页头行，因此侧栏、详情列与 hero 主体不可拖拽；打包应用必须重新构建才能获得新的客户端 bundle（`lib/client.js` 由 client-modules 提供，必须存在）。
