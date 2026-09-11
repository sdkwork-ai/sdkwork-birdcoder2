# Agent Note: 桌面宿主保留 fork 的 `/api` 回退，资源管理器定位改由单个 token 承载

Status: implemented

[English](2026-09-10-desktop-host-api-fallback-and-explorer-reveal.md) | 中文

## 问题

2026-09-10 的上游对齐（`chore 54561513cf`）用上游的 `apps/desktop` 与其新建的 `apps/desktop-host` 取代了 fork 自己的宿主，两个桌面手势因此失效。

工作区行菜单的「打开文件夹」报 `POST dsh-app://app/api/host.openPath 404 (Not Found)`。对齐之前，`apps/desktop/src/host.ts` 以程序方式挂载 fork 的网关——`DESKTOP_APIPROXY_PATCH = { insert: [{ id: 'api-gateway', name: '@deepseek-ai/dsh-host-apiproxy' }] }`，与 `@deepseek-ai/dsh-sdkwork-desktop-app` overlay bundle 并列，由后者的 patch 承载 `sdkwork-api-gateway` 行。合并后的宿主组合是 `dsh-base` + `dsh-web-app` profile 加一个 launcher overlay `apps/desktop-host/config/desktop.cordis.patch.yml`，而该文件——至今仍与上游逐字相同——两行都没有。`apps/desktop-host/package.json` 保留了 `sdkwork-api-gateway` 依赖，因此没有任何检查失败：渲染进程同源的 `POST /api/host.openPath` 抵达 Connection，而 Connection 的 `/api` 分发只在 `ctx.sdkworkApiFallback` 存在时才回退；该服务缺位时，请求终结于 Connection 自己的 `not found` 分支。同一个 404 也覆盖 `host.openTerminal`、工作区头部背后的 `host.describe`，以及 apiproxy 名册的其余方法。该 overlay 现在是回退唯一可能的挂载点：仓库中没有任何 bundle patch 挂载 `@deepseek-ai/dsh-host-apiproxy`，因为 fork 的桌面宿主曾是唯一挂载处，而合并后的运行时加载的正是这个文件。

交付文件卡片上的「在文件资源管理器中显示」点了没有任何反应。同一次对齐还带来了上游新增的 `revealNativePath`，其 Windows 分支执行 `run('explorer.exe', ['/select,', target])`——两个 `execFile` 参数，于是命令行在逗号后多了一个空格。Explorer 的 `/select,` 开关要求开关与其目标同属一个命令行 token（[`showinfilemanager`](https://github.com/damonlynch/showinfilemanager) 的表述是「逗号与 URI 之间不得有空格」）；被拆成两个 token 后，Explorer 忽略目标并打开其默认文件夹，用户看到的就是「点了没反应」。上游选择的目标形态——百分号转义的 `file://` URI——是正确的，正是它让空格与逗号完全不出现在命令行里，所以需要去掉的只有那次拆分。

## 决策

`apps/desktop-host/config/desktop.cordis.patch.yml` 以 fork 自有行插入回退的两半：`sdkwork-api-gateway`（`@deepseek-ai/dsh-sdkwork-api-gateway`）提供 `ctx.sdkworkApiFallback`，`apiproxy`（`@deepseek-ai/dsh-host-apiproxy`，`config: { nativeOpen: true }`）提供 `ctx.apiProxy`——在它缺位期间网关对所有方法答 404。`nativeOpen: true` 陈述的是桌面壳本就体现的事实：这个 Host 把路径交给操作系统打开器，而不是去询问显示服务器。`apps/desktop-host/package.json` 把两者声明为 `workspace:^` 依赖，使打包闭包能带上它们。

`revealNativePath` 只传一个参数 `` `/select,${target}` ``。该分支的注释记录了为什么逗号与 URI 之间不能有空格。

fork 有意不恢复被上游壳取代的那些本地行。`app://` 载体位于主进程的协议处理器里，窗口是原生边框，托盘已记录为有意删除，更新提示走原生对话框——因此重新加入 `sdkwork-desktop-carrier`、`window-controls` 或 `update-banner` 会让它们各自重复一份。overlay 于是只插入 `directory-picker-native`、`ui-directory-picker-native` 与回退的两行。

## 验证

新增的守护用例是 `apps/desktop/tests/desktop-host-composition.spec.ts`。它固定 overlay 的 insert 列表、两条 `workspace:^` 依赖，以及每个挂载名都能解析到发布它的 workspace 包；它同时固定分发的次序——Connection 自己的路由优先、网关按请求惰性读取、只有 404 才触发回退。

`pnpm exec vitest run packages/util/native-command/tests/path-opener.spec.ts packages/api/session-controller/tests/session-open-workspace-path.host.spec.ts` 通过 49 个用例，其中 40 个是打开器套件，现已固定 `win32` 与 WSL 转译两种情形下的单 token argv。

一个探针经由真实的 framed byte pipes 驱动 `runDesktopHost`，也就是 Electron 协议处理器所走的那条路径。`GET /api/present.host` 返回 200 `{"name":"BrainX","available":true,"fileManager":"explorer"}`；`POST /api/host.describe` 返回 200 且 `canOpenPath: true`；`POST /api/host.openPath` 返回 200，且 Host 真的执行了 `powershell.exe -NoProfile -Command Invoke-Item -LiteralPath '…'`（探针用的伪路径在 PowerShell 内部报错，这正证明分发抵达了原生打开器而非桩实现）；`POST /api/session.list` 经 Typert 拦截器返回 200。定位探针打印出的被拦截 argv 为 `[["explorer.exe",["/select,file:///E:/…/reveal%20probe%2C%20dir/target%20file%2Cwith%20comma.txt"]]]`，`openWorkspacePath(reveal)` 正常解析。

`npx tsc -b tsconfig.host.json`（包含 `apps/desktop/tests`）与改动文件上的 oxlint 均通过。

有一处行为被记录而非修改：坐标非法的 `POST /api/present.open` 由网关返回 415，因为分发把 Connection 自己的 404 当作回退触发条件。这与 `packages/client/connection/src/index.ts` 在 Web 侧的组合同序，也正是使用伪 `sessionId` 的探针看到 415 的原因——真实卡片在文件有效时得到 204，在回退之前就已返回。

## 备选方案

**恢复 fork 的桌面宿主，而不是修补上游组合。** `apps/desktop/src/host.ts`、它的 `DESKTOP_APIPROXY_PATCH` 以及它所属的本地壳都仍在历史中。否决：对齐是有意采纳上游架构的，托盘与载体也已记录为有意损失。而且这并不足够——`sdkwork-desktop-app` bundle 挂载了 `sdkwork-api-gateway`，却从未挂载 `apiproxy`，回退仍会是 404。

**把两行放进 `packages/bundle/sdkwork-desktop-app/cordis.patch.yml`。** 否决：该 bundle 已无人加载。`loadProfileDirectory('dsh desktop', …)` 从已安装的 `@deepseek-ai/dsh` 解析 bundle，而后者只列 `dsh-base` 与 `dsh-web-app`，launcher 唯一的 overlay 是 desktop-host 那个文件。该行会成为死代码，让修复看起来已生效而 404 照旧——本次修复的第一次尝试实际就落到了这个状态，直到探针把它证伪。

**改为给 Windows 路径加引号，而不是发 URI。** `explorer.exe /select,"C:\path"` 是文档化的纯路径形式，但从 `execFile` 发出时需要转义内嵌引号，而含空格或逗号的路径随后还要穿过两层解析器。URI 把两者都挡在命令行之外，因此目标形态被保留，只去掉了 token 拆分。

## 影响

桌面端的 `/api` 名册恢复应答，而产生本报告的那个失败模式——fork 行被上游拥有的 overlay 静默丢弃、其依赖却留在原地——现在会先让用例失败，而不再抵达用户。overlay 的 insert 列表已被固定，因此重新加入被取代的 fork 行同样会失败，而不会让壳重复渲染。

`POST /api/host.openPath` 现在在任何 Host 平台都能抵达操作系统打开器，定位手势交给 Explorer 的是它文档化要求的单个 token。合并时的复核仍归属 [上游同步流程](../process/2026-08-21-upstream-sync-procedure.zh.md)，其 2026-09-10 的记录（[b2e3b2a012 同步](../process/2026-09-10-upstream-sync-b2e3b2a012.zh.md)）即本 note 修复的那次对齐；打包与更新行为仍如 [Electron 桌面打包说明](../architecture/2026-08-25-electron-desktop-packaging-and-updates.zh.md) 所述，图标与托盘决策见 [桌面应用图标 note](2026-09-10-desktop-app-icon-merge-stability.zh.md)。
