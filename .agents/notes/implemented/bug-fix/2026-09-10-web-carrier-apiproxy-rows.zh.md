# Agent Note: Web 载体同样挂载 apiProxy 域

Status: implemented

[English](2026-09-10-web-carrier-apiproxy-rows.md) | 中文

## 问题

2026-09-10 的上游合并把桌面载体的 fork `/api` 回退弄丢了（已在[桌面宿主 note](2026-09-10-desktop-host-api-fallback-and-explorer-reveal.zh.md) 修复），本次后续审计发现同一丢失还有更宽的一层：**web 组合从一开始就没挂载这两行**。`dsh web` 组合 `dsh-base` + `dsh-web-app`，而 `web-app` bundle 的 insert 列表既没有 `sdkwork-api-gateway` 也没有 `apiproxy`——只有桌面 overlay 挂了。对这一精确组合的受控启动探测:`POST /api/host.describe` 404、`POST /api/workspace.list` 404、`POST /api/host.openPath` 404；把两行加回后全部变 200。

这不是边角：客户端运行时的 `WorkspaceRuntime`（侧边栏消费的 `workspaces` 服务）在所有载体上都说 apiProxy 线上方言——`workspace.list`、`host.describe`、`host.openPath` 都是 apiProxy 方法。因此 web 载体上渲染器的整个数据面都在 404：工作区列表为空、打开文件夹与在终端打开失效、没有 `host.describe`。gateway README 甚至把缺席记录为有意（"web 组合两者都不挂载"）——那是合并前 web 组合的形状，当时它的渲染器还说 BFF Typert 方言；这份契约如今已不存在。

## 决策

`packages/bundle/web-app/cordis.patch.yml` 插入两行（`sdkwork-api-gateway`、`apiproxy`——不带 `nativeOpen` 配置，打开器可用性走平台检测，无头 Linux web 主机会如实报告 `canOpenPath: false`），bundle manifest 把两者声明为 `workspace:^` 依赖以进入解析闭包。桌面 overlay 保留其 `nativeOpen: true` 事实，改为对 bundle 挂载的行做 config 覆盖——在 overlay 里重复插入同 id 行会把插件挂载两次，因为 boot 把每层的 `insert` 组合为独立行。

`apps/desktop/tests/desktop-host-composition.spec.ts` 现在固定这一分工：bundle 挂载两行并声明两个依赖；overlay 对 apiproxy 的唯一触碰是 `nativeOpen` 覆盖；overlay 的 insert 列表限于原生的目录选择器。测试改用 `loadOverlayPatches`（boot 自己的装载器——bundle patch 携带普通 YAML 解析会拒绝的 `!!js` 表达式）解析两份 patch 文件，为此给 `apps/desktop` 加了 `@deepseek-ai/dsh-app-boot` devDependency。

## 验证

经已安装桌面项目的组合做受控启动，走 `runDesktopHost`（Electron 子进程的同一入口）驱动：去掉两行时 `host.describe`/`workspace.list`/`host.openPath` 全部 404；加上后（行改由 bundle 持有、`nativeOpen` 覆盖来自 overlay）`host.describe` 返回 200 且 `canOpenPath: true`，`workspace.list` 返回 200，`host.openPath` 返回 `{ opened: true }` 并弹出真实的资源管理器窗口。`pnpm vitest run desktop-host-composition` 8 个用例通过；补上 `tsconfig.base.json` 的 `sdkwork-api-gateway/desktop` 路径行后，`pnpm run verify-cordis-config` 只剩既有的 `apps/cli/tests/profiles/acp/cordis.yml` 指针 fixture 报怨。

## 备选方案

**只把两行留在桌面 overlay 里（合并前的形状）。** 否决：`dsh web` 直接组合 `dsh-base` + `dsh-web-app`，从不加载桌面 overlay，web 载体的渲染器数据面会继续 404——正是本 note 修复的那个回归。

**在 bundle 和桌面 overlay 里都插入这两行。** 否决：boot 把每层的 `insert` 组合为独立行，相同 id 会把插件挂载两次；overlay 改为对 bundle 挂载的行保留 config 层面的 `nativeOpen: true` 覆盖。

## 影响

两个载体现在由同一份 bundle 行服务同一渲染器数据面，上游合并再丢行会在两个表面的组合门上同时变红。打开器策略的桌面/web 分裂只剩一个配置值，且文档写在设置它的地方。审计同时记录（未采取行动）`packages/client/ui-sdkwork-mobile-simulator` 以未挂载状态随包发布（其槽位占位一旦挂载就无条件渲染，裸行会在壳层上悬浮设备边框）；其 README 已写明这一点。
