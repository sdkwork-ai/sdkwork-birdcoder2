# Agent Note: 桌面端保留 BirdCoder 应用图标

Status: implemented

[English](2026-09-10-desktop-app-icon-merge-stability.md) | 中文

## 问题

2026-09-10 的上游对齐（`chore 54561513cf`）让 `apps/desktop/src/main.ts` 采纳了上游的窗口创建代码。上游从不指定应用图标，而此前的 fork 壳会把随包分发的 `build/icon.png` 传给每个 `BrowserWindow`。同一次改动还删除了 `apps/desktop/scripts/generate-icons.mjs`、对应的 `generate-icons` 包脚本、该脚本用于缩放的 `assets/birdcoder2-appicon.png` 位图，并把窗口位图从 electron-builder 的 `files` 列表中移除。

已提交的位图本身保留了下来，因此安装包仍通过 electron-builder 默认的 `build/icon.*` 路径带上鸟图标，但留下了三处缺口。未打包壳（`pnpm dev:desktop`、`start:desktop`）以及任何需要显式图标的已打包窗口只能显示 Electron 默认图标。仓库中已没有任何内容可以复现这些位图：源位图没了，用它拼装 ICO 与 ICNS 容器的生成脚本也没了。而当某次合并删掉位图或断开图标接线时，也不会有任何检查失败——本次回归正是这样进入 master 的。AGENTS.md「BirdCoder 品牌资产」声明桌面端从 `apps/web/public/favicon.png` 派生 `apps/desktop/build/icon.{ico,icns,png}`，而该声明此前没有实现支撑。

## 决策

fork 拥有一个窗口图标文件 `apps/desktop/src/app-icon.ts`。它在 `app.getAppPath()` 下解析 `build/icon.png`，且只对由窗口自绘图标的平台返回该路径；macOS 的图标来自已签名 bundle，因此在该平台返回 undefined。`createWindow()` 把结果传给每个 `BrowserWindow`，覆盖开发态与打包态的主窗口和插件管理窗口。打包配置把同一位图加入 `files`，asar 应用再通过 `app.getAppPath()` 读回它。

`apps/desktop/scripts/generate-icons.mjs` 作为唯一的派生步骤回归，并改为直接读取规范位图 `apps/web/public/favicon.png`，而不再依赖已删除的 `assets/` 副本。它用 sharp 裁掉透明边距、渲染正方形 RGBA 位图，并在脚本内拼装 Windows ICO（16 至 256）与 macOS ICNS（16 至 1024）容器，因此重新生成不依赖任何平台图标工具。`pnpm --dir apps/desktop run generate-icons` 会重写这三个随包文件；仓库中提交的位图就是该命令的产物。sharp 进入 `apps/desktop` 的 devDependencies，与 workspace 构建脚本白名单中已记录的 sharp 图标栅格化用途一致。

打包配置显式指定每个图标，而不继承 electron-builder 默认值：`directories.buildResources` 为 `build`，`mac.icon`、`win.icon`、`linux.icon` 以及三个 NSIS 安装器图标都通过 `brandIcon()` 指向随包位图；该函数在文件缺失时于打包前直接抛错。`apps/desktop/tests/app-icon.spec.ts` 断言位图格式（512×512 PNG、含 16 与 256 条目的 ICO、含 512 与 1024 块的 ICNS）、按平台解析窗口图标的行为，以及打包接线。

## 验证

`pnpm exec vitest run apps/desktop/tests/app-icon.spec.ts` 覆盖位图结构、窗口图标解析与打包接线；`apps/desktop/tests/macos-signature.spec.ts` 仍会执行同一个配置工厂。`npx tsc -b apps/desktop` 与 `npx tsc -b tsconfig.host.json`（包含 `apps/desktop/tests`）通过，改动文件上的 oxlint 也通过。重新生成的位图已按图像逐一检查，且重跑 `generate-icons` 会逐字节复现它们。打包态的一处细节已直接验证：对一个内含 `build/icon.png` 的 asar 归档启动 Electron 进程后，它通过 `app.getAppPath()` 读到了 512×512 的图标；`build/icon.png` 也能穿过 electron-builder 排除构建资源目录其余内容的 `files` 过滤。此处未运行 electron-builder 打包本身：它需要某个发布目标准备好的 runtime、包集合与 seed。AGENTS.md 品牌检查单新增了同样的三项检查，使下一次上游合并推送前会重新核验接线。

## 备选方案

**依赖 electron-builder 默认值与已打包可执行文件的图标。** 这正是对齐合并留下的状态，且不需要任何代码：安装后的应用通过可执行文件带上鸟图标。代价是未打包壳仍显示 Electron 默认图标，且当某次合并删除位图时不会有检查失败，于是回归会静默复现。

**只提交位图、不恢复生成脚本。** 这样仓库更小，也不必引入 sharp devDependency，但会让这三个随包文件无法由仓库内容复现、也不被任何测试校验，而这正是它们被合并在不知不觉中丢弃的条件。

**恢复 `assets/birdcoder2-appicon.png` 作为生成脚本的源。** 指回被删除的 fork 副本可以原样恢复旧管线，但会与 AGENTS.md 固定在 `apps/web/public/favicon.png` 的规范位图重复，并重新引入第二个需要同步维护的文件。

**通过 `extraResources` 分发窗口位图并从 `process.resourcesPath` 解析。** 这样做把构建资源与应用代码分开，但 shell 就需要在开发态与打包态解析两条不同路径。放入 `files` 让两者共用一条路径，用例中现有的打包路径检查也固定了该行为。

## 影响

窗口图标现在有三个各自独立的载体：shell 的窗口选项、asar 内的位图、electron-builder 的图标字段。任何一次合并若回退其中任意一项，都会让 `app-icon` 用例或 AGENTS.md 中的共享校验命令失败，而不再发出一个无品牌窗口。代价是一个新源文件、一个回归脚本、一个 devDependency，以及约 250 KB 的 asar 内容。

图标生成现在与规范位图绑定：更换产品标志意味着替换 `apps/web/public/favicon.png`、重新运行 `generate-icons`，并提交重新生成的 `build/icon.{png,ico,icns}`。ICO 与 ICNS 容器在仓库内拼装，因此其正确性由用例的格式断言覆盖，而不依赖平台工具。

同样使用该位图的桌面托盘未在此恢复；对齐合并把该 fork 特性作为采纳上游架构的一部分有意删除（[桌面托盘后台模式](../feature/2026-08-15-desktop-tray-background-mode.zh.md) 记录了它的设计，以备回归）。打包与更新行为仍如 [Electron 桌面打包说明](../architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md) 所述，合并时的复核归属 [上游同步流程](../process/2026-08-21-upstream-sync-procedure.zh.md)。
