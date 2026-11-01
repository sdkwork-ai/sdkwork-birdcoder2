# Agent Note: Linux 绘制产品顶栏，而不是叠出第二个页头

Status: implemented

[English](2026-11-01-linux-desktop-caption.md) | 中文

## Problem

桌面壳此前有三种窗口外观。Windows 用 40 DIP 顶栏加原生窗口按钮覆盖层替代系统边框；macOS 保留 `hiddenInset` 红绿灯与侧栏毛玻璃；Linux 保留系统边框、Electron 自带的应用菜单和页面。在 Ubuntu 上，Linux 这套会渲染出两个页头：先是窗口管理器的标题栏，再是 Electron 的本地化“应用/编辑”菜单行，最后才是页面。原生菜单行取自 GTK 主题而不是应用调色板，因此深色主题下标题栏与侧栏之间仍会出现一条浅色带。产品要求 Linux 也采用 Windows 的方案：开关与菜单处在同一条顶栏内，原生窗口按钮位于该栏右端。

## Decision

- `apps/desktop/src/caption-platform.ts` 提供唯一判据：`usesProductCaption(platform)` 在 `win32` 与 `linux` 上为真。主进程与 preload 中每一处关于顶栏的判断都读取该判据，两个平台不会再各自漂移。
- 使用产品顶栏的平台把主窗口设为 `titleBarStyle: 'hidden'` 加 `titleBarOverlay`。Linux 另外从 shell 调色板兜底值取得 `backgroundColor`，外观上报再用实测顶栏底色重绘窗口底色，因此缩放或重载的空隙显示的是应用调色板，而不是 Electron 默认的白色。
- 使用产品顶栏的平台只向 `Menu.setApplicationMenu` 注册隐藏的快捷键行。窗口管理器没有原生菜单行可画，Alt 也无行可唤出；顶栏中的“应用”和“编辑”打开同一批原生弹出菜单，其 IPC 处理程序现在也接受 Linux 发送方。
- 应用 preload 在两个平台都写入上游的 `data-windows-titlebar` 标记与 40px 高度变量，挂载顶栏菜单，并上报实测的顶栏与符号颜色。标记沿用上游这个带 Windows 字样的名字，因为上游的布局、侧栏、dockkit 与设置样式表里每条顶栏规则都以它为准；另起一个 fork 自有属性会一次性分叉所有这些规则。
- 使用产品顶栏的平台上，全屏切换及每次页面加载后都会同步全屏状态，让壳在原生控件消失时去掉顶栏避让；内嵌更新文档在两个平台都让出顶栏区域。
- macOS 不变：保留 `hiddenInset`、红绿灯和原生菜单行。

## Alternatives considered

| 否决方案 | 一句话理由 |
|---|---|
| 保留系统边框，只去掉 Electron 的菜单行 | 确实回到单个页头，但产品自己的“应用/编辑”入口从窗口外观中消失，系统仍按 GTK 主题绘制标题 |
| 保留系统边框，把菜单挪进页面 | 顶栏入口属于窗口外观，不能放进任何界面都可能盖住的页面 |
| 把标记改成与平台无关的名字 | 上游有数十条 CSS 规则及其测试断言 `data-windows-titlebar`，改名会分叉全部规则和此后上游对这些规则的每次改动 |
| 在 Linux 上自绘 Web 窗口按钮 | 原生覆盖层保留系统交互（贴边、双击最大化、无障碍），且不需要新的 IPC 或图标集 |

## Consequences

Linux 窗口现在与 Windows 顶栏完全一致：一个 40 DIP 的栏内左侧是侧栏开关和本地化“应用/编辑”入口，右端是原生窗口按钮，两种主题下都用应用调色板绘制。`data-windows-titlebar` 标记还让顶栏行成为 Linux 窗口的拖动区域，拖动窗口与双击最大化沿用与 Windows 相同的 CSS。固定尺寸的欢迎窗口保留系统边框；它共用应用菜单，而该菜单现在不注册任何可见行，因此它也只剩一条标题栏，而不是标题加菜单行。

代价与边界：Linux 窗口现在依赖 Electron 的 Linux 顶栏覆盖层，而不再依赖窗口管理器自绘的边框；调色板变化会通过外观上报重绘窗口底色；标记仍带 Windows 字样；自动化车道覆盖平台判据、窗口选项、菜单模板、全屏同步、弹出菜单与外观同步，GTK 绘制的按钮本身仍需在真实桌面上人工确认。

## Verification

```sh
pnpm exec vitest run apps/desktop/tests/caption-platform.spec.ts apps/desktop/tests/main-startup.spec.ts \
  apps/desktop/tests/preload-windows.client.spec.ts apps/desktop/tests/preload-platform.client.spec.ts \
  apps/desktop/tests/update-overlay.spec.ts
grep -rn "process.platform === 'win32'" apps/desktop/src/preload-windows.ts apps/desktop/src/preload-platform.ts  # nothing: both read the gate
```
