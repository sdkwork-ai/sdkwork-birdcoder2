# Agent Note：Linux 桌面顶栏

Status: implemented

[English](2026-11-01-linux-desktop-caption.md) | 中文

## 问题

Ubuntu/Linux 的桌面主窗口画了两条 header。窗口带系统边框，于是 GTK 画出标题栏（应用名与最小化/最大化/关闭），而共享应用菜单是可见的原生菜单，于是它下面又压了一行「应用」与「编辑」命令。Windows 早已把这两条合并成一条：隐藏原生标题栏、用 Electron 的窗口按钮覆盖层提供原生最小化/最大化/关闭按钮，再叠上共享的 40 DIP 页内顶栏（侧栏开关/品牌、本地化的「应用」「编辑」入口、拖拽区），由桌面 preload 通过共享布局的 `data-windows-titlebar` 标记发布。Linux 因此每个窗口都多花一条标题栏加一行菜单，菜单的语言和命令集还可能和旁边顶栏不一致。

## 决策

### Linux 加入顶栏平台集合

`apps/desktop/src/main.ts` 的 `desktopCaptionPlatform()` 对 `win32` 和 `linux` 返回 true。`createWindow()` 给主窗口 `titleBarStyle: 'hidden'` 加 40 DIP 的 `titleBarOverlay`（颜色跟随应用调色板），两个平台都让 Electron 在页面上绘制原生最小化/最大化/关闭按钮。`apps/desktop/src/preload-windows.ts` 在 Linux 上也发布 `data-windows-titlebar` 标记和 `--dsh-windows-titlebar-height`，共享客户端布局据此为顶栏留出高度；`apps/desktop/src/preload-menu.ts` 在同一个隔离 shadow root 里挂载本地化的「应用」「编辑」入口。

名字保留上游的。fork 不改 `packages/client` 里的 `data-windows-titlebar`、`--dsh-windows-*` 变量与 Windows 命名的顶栏 CSS，只扩大发布标记的平台（`preload-windows.ts`）；这个名字是共享的历史名称，不是平台判断。客户端包零改动。

### Linux 应用菜单改为不可见、只注册快捷键

与此前的 Windows 相同，`main.ts` 装上隐藏的 `toggleDevTools` 项和隐藏的 F12 别名，取代可见的「应用/编辑」菜单，因此窗口上方不再画原生菜单行。顶栏的「应用」「编辑」入口取代它：主进程在两个顶栏平台都处理 `dsh-desktop:windows-menu`，在顶栏入口的锚点处打开原生弹出菜单；「编辑」把撤销、重做、剪切、复制、粘贴、删除、全选以按键形式转发给聚焦的编辑器。

顶栏弹出菜单的颜色在 Linux 上同样走 `dsh-desktop:windows-appearance` → `setTitleBarOverlay` 路径。全屏切换也在 Linux 上转发给渲染器（`main.ts` 与 `apps/desktop/src/preload-platform.ts`），因此原生按钮消失时共享布局会去掉顶栏留白。

### 带边框与隔离的表面避开顶栏

Linux 欢迎窗口保持系统边框——它唯一的 header 就是 GTK 标题栏——但带边框的窗口仍会把共享的隐藏应用菜单画成一条空的原生菜单行。`openWelcomeWindow()` 在 Linux 上调用 `window.setMenu(null)`，因此不会再出现第二条 header。隔离的更新与强制更新浮层视图在 Linux 上和 Windows 一样从 `WINDOWS_TITLEBAR_HEIGHT`（40 DIP）开始（`apps/desktop/src/update-overlay.ts`），把顶栏及其菜单留在浮层上方可操作。

Linux 的右键上下文菜单角色标签与 Windows 一样按同一顶栏平台条件本地化，「应用」菜单的退出项在 Linux 上使用本地化的 `quitApplication` 标签（`exitApplication` 仍是 Windows 的标签）。

## 考虑过的替代方案

**保留 Linux 原生菜单、只把它藏起来。** 这是最小改动：自动隐藏菜单行，按 Alt 再显示。但它仍把第二条 header 藏在键盘惯例后面，而顶栏已经带了同样的命令，Linux 窗口会保留一个其它顶栏平台没有的 header。fork 选择移除该行。

**删掉或改名上游的 `data-windows-titlebar` 标记与 `--dsh-windows-*` 变量。** 改用 Linux 命名的标记和变量读起来更诚实，但它们位于上游拥有的共享客户端 CSS 与布局里，fork 会背上一份每次上游合并都要重新裁决、且可能被回退的大改名 diff。复用历史名称把合并面收窄到桌面 preload 里的平台条件；客户端包零改动。

**用自定义 HTML 窗口按钮代替原生窗口按钮覆盖层。** 自定义按钮能让顶栏自由设计按钮，但要在应用里重做原生顶栏交互（拖拽、双击最大化、贴边、系统菜单、无障碍），而 Windows 已经选择了原生覆盖层。桌面外壳保留原生覆盖层，只画页内那一行。

**把 Linux 欢迎窗口也改成无边框。** 无边框欢迎窗口能去掉它的原生标题栏，但这超出所报主窗口 bug 的范围，固定尺寸的欢迎窗口也用不上覆盖层；去掉它的空菜单行已经只剩一条 header。

**让隔离更新浮层保持 top 0。** 浮层视图会盖住 Linux 的顶栏，并在更新提示或强制策略期间让顶栏菜单不可达；按顶栏高度下移是 Windows 的行为，照搬到 Linux。

## 后果

Ubuntu/Linux 的主窗口只剩一条 header：页内 40 DIP 顶栏，原生按钮在它右侧。GTK 标题栏与原生应用菜单行都不再出现。最小化/最大化/关闭仍由 Electron 提供原生按钮，因此保留操作系统行为。Linux 欢迎窗口保留一条原生标题栏并去掉空菜单行。顶栏颜色跟随应用调色板，Linux 的右键菜单标签与顶栏退出项跟随外壳语言。代价是 Linux 依赖 Electron 对 Linux 窗口按钮覆盖层的支持，以及 `data-windows-titlebar` 这个历史性（而非字面准确）的共享标记名；上游将来改动该标记或顶栏 CSS 会经由同一份共享代码影响 Linux。

## 测试

`pnpm exec vitest run apps/desktop/tests/main-startup.spec.ts apps/desktop/tests/preload-windows.client.spec.ts apps/desktop/tests/preload-platform.client.spec.ts apps/desktop/tests/update-overlay.spec.ts apps/desktop/tests/welcome-window.spec.ts` 覆盖各平台的窗口选项（`win32`/`linux` 隐藏标题栏加 40 DIP 覆盖层，`darwin` 用 `hiddenInset`）、两个顶栏平台上不可见且只注册快捷键的应用菜单、Linux 上本地化的顶栏弹出菜单、调色板 IPC 与右键菜单标签、Linux 全屏状态转发、`win32`/`linux` 的顶栏标记、浮层 40 DIP 的顶部偏移，以及仅 Linux 欢迎窗口调用 `setMenu(null)`。
