# Agent Note: 内置用量与计费仪表盘，由 git 子模块接入

Status: implemented

[English](2026-11-08-built-in-usage-billing-plugin.md) | 中文

> **2026-11-08 起部分取代。** 插件现在是 fork 自有的子模块（`sdkwork-ai/sdkwork-dsh-usage-billing`），由本 fork 编辑：侧栏费用卡默认隐藏，卡面画在设置菜单的账户身份行下方。下面的行、组合、模块表、工作区成员关系与「按随仓产物运行」的推理仍然成立；只读归属关系与「本仓库不编辑」的决策不再成立。见 [分叉用量计费插件，把卡面移到设置菜单](2026-11-08-forked-usage-billing-settings-card.zh.md)。

## 问题

仪表盘需要的一切本就在 Harness 里：每一次模型调用都带着 token 数、缓存命中、峰谷档位与路由，持久化在会话日志中——但这些数据从未摆到用户面前。构建给用户看的只有当前会话的上下文用量条；而一个在花钱的人想看的是账单：今天、本周、本月，按供应商、按模型、按会话，以及高峰期与低谷期各自的费率。

`@kenz1117/dsh-ui-usage-billing` 是把这个账单真正做出来的第三方插件：它从持久化日志折叠出真实用量，附上侧栏费用卡、完整仪表盘、供应商余额与订阅额度、低谷任务队列、CSV/JSON 导出，以及按 `models.dev` 保持最新的价目表。要得到它，用户得自己找到这个包，执行 `dsh plugin --profile web add @kenz1117/dsh-ui-usage-billing`，再重启宿主。在用户这么做之前，已发布的构建没有这个界面。

把它做成内置需要同时满足三件事：插件出现在已发布的构建里、无需安装步骤即启用、每次发布都不必重移一遍别人的代码。

## 决策

`@kenz1117/dsh-ui-usage-billing` 以 `plugins/dsh-ui-usage-billing` git 子模块链接进本仓库，作为工作区成员加入 pnpm workspace，并由 Web bundle 自己的 patch 组合。最初的接入不编辑它的任何内容。2026-11-08 起，该子模块的仓库是本 fork 自有的 `sdkwork-ai/sdkwork-dsh-usage-billing`，因此插件上的 fork 改动在那边完成并构建，而不是在本检出里做本地编辑（[fork 说明](2026-11-08-forked-usage-billing-settings-card.zh.md)）。

### 组合

`packages/bundle/web-app/cordis.patch.yml` 只带一行：

```yaml
- id: ui-usage-billing
  name: '@kenz1117/dsh-ui-usage-billing'
```

这一行就是全部集成面，而它同时承载两半。

宿主半在 `ctx.webServer` 上以同源 `/api/billing/` 前缀注册路由——从持久化会话日志折叠出的用量、余额、订阅、中转站额度、价格、任务队列、通知认领——并注入 `sessionPersistence`、`credentials` 与 `settings`，这三个服务 base 与 Web 层本来就提供。它的模型侧 `usage_stats` 工具只是被声明，只有用户显式开启后才注册，因此默认组合不会给任何 preset 的目录新增工具，也不会新增提示词段落。

浏览器半是普通的 `dsh.client` bundle（`platform: 'web'`，对 `@deepseek-ai/dsh-client-locale` 与 `@deepseek-ai/dsh-client-ui-conversation` 声明加载顺序边）：它把费用卡注册进 fork 侧栏的 `sidebar.footer.action` 座位，把 `settings.section` 页面作为卡片隐藏后的恢复入口，把输入栏费用胶囊注册进 `conversation.composer.dock` / `conversation.input.*`，并注册 `/usage` 命令。这些座位全部由 fork 自己的宿主包声明——`sidebar.footer.action` 来自 `ui-sdkwork-sidebar`，`settings.section` 来自 `ui-sdkwork-settings-menu`，输入栏座位来自 `ui-conversation`——所以 fork 的行替换恰好就是插件注册的目标；`ctx.slots.inject` 会跳过宿主未声明的座位，因此各界面逐个降级，而不是整个插件失败。

包自带的 `dsh.bundle.patch` 插入的正是同一个 `ui-usage-billing` 行。它被有意地**不**加入 profile 的 bundle 列表：Web patch 里这一行是唯一挂载点。`dsh-sdkwork-desktop-app` 在 `dsh-web-app` 之上打 patch，因此桌面 profile 继承该行，不需要第二次声明。

### 模块表

浏览器半遵循本仓库挂载其他第三方插件时已经在用的 out-of-tree 客户端 bundle 协议：`window.__ModuleLoader__.load({ id, factory })`，平台种子模块经注入的 `require` 外置，其余全部内联。它外置 `react`、`react-dom`、`react/jsx-runtime`、`@deepseek-ai/dsh-client-ui-primitives` 与 `@deepseek-ai/dsh-client-store`——五个 key 都在页面那张冻结模块表里，也都在本 fork 的种子声明中。

组装式客户端测试层会在进程内导入每个 roster 行的 `/client` 产物，而它的 require 表只列了其中四个。`packages/test-support/client-runtime/src/assembly/modules.ts` 现在把 `@deepseek-ai/dsh-client-store` 一并列出，这是诚实的修法：插件拿到的 store handle 必须是宿主的类实例，而不是又内联一份。将来若有第三方 bundle 再外置一个种子模块，该测试会带着具体 specifier 直接失败。

### pin 与更新

gitlink 是 `9cba33d`，即 fork 的 `1.8.4-sdkwork.3` 提交（在 `v1.8.3-alpha.4` 基线之上加了默认隐藏的卡面与设置菜单账号卡，并在同一次提交里构建）。fork 把构建产物 `lib/index.js`、`lib/client.js`、`lib/invariant.js` 与 `lib/types` 声明一并提交，而本仓库按发布产物原样运行，因此 pin 必须是源码与已提交构建彼此一致的修订。`.gitmodules` 记录 `branch = main`，因此 `git submodule update --remote plugins/dsh-ui-usage-billing` 可以推进 pin。

插件在 `dsh.compatibility` 中声明覆盖到 `0.2.2-rc.1` 的每一个宿主版本，这正是本 fork 当前版本；它的 `devDependencies` 把 `@deepseek-ai/dsh-*` 钉在该精确版本上——与其他内置插件相同的约束，也是本 fork 换版本线时必须同步移动这些 pin 的原因。

### 工作区成员与依赖

`plugins/*` 加入 `pnpm-workspace.yaml`，因此该包作为工作区成员链接，bundle 的行按包名解析到它。安装会把它宿主半的 peer（本仓库的 `@deepseek-ai/dsh-*` 包）链接进 `plugins/dsh-ui-usage-billing/node_modules`，并安装它唯一的运行时依赖 `clsx`——后者会被浏览器 bundle 内联。

作为成员加入也意味着安装它自己的开发者依赖闭包（`tsdown`、`vitest`、`@playwright/test`、`shiki`、`katex` 等）。这是「按成员发布」而非「按源码重建」的代价，也是移动该 pin 会刷新 `pnpm-lock.yaml` 的原因：lockfile 记录了这个闭包，本 fork 每次发布都会重新安装它。

`plugins/*` 位于 tsdown 的构建 glob（`vendor/*`、`packages/*/*`）之外，因此仓库构建不会多出一个自带构建流程的插件。

### 命名

该插件最初既不在这里编写，也不在这里定制：重命名会破坏它自己的构建，并让每次上游更新都变成一次重移。它靠位置（上游没有 `plugins/` 目录）与 gitlink（合并无法把它改写成别人的版本）避免与上游冲突。loader 行沿用插件自带 bundle patch 的 id（`ui-usage-billing`），因此从 npm 安装该包的 profile 与已发布构建指向同一个条目名。2026-11-08 起仓库改由 fork 自有（仍保留包名与行 id），见 [fork 说明](2026-11-08-forked-usage-billing-settings-card.zh.md)。

### 验证

`packages/bundle/web-app/tests/built-in-usage-billing.spec.ts` 断言组合出的行、被链接清单的 `dsh.client` web 声明与 `dsh.bundle.patch`、两个构建入口产物、宿主半的四个注入服务与 `/api/billing/usage-stats` 路由、客户端半的 `sidebar.footer.action`、`settings.section` 与 `settings.menu.account` 注册，以及两个桌面覆盖层都没有禁用或改指该行，并证明该检查会拒绝每一种不完整形态。`packages/test-support/client-runtime/tests/assembly-bundle-roster.client.spec.ts` 断言 roster 行并确认它声明的 `inject` 边都能解析（两个目标都是 roster 行，因此悬空边清单不会变长）；`assembly-test-client.client.spec.ts` 用进程内模块表物化这份随包发布的客户端 bundle，启动整个 Web roster。`plugins/README.md` 记录更新流程。

## 考虑过的替代方案

**走 registry 依赖** —— `dsh plugin add @kenz1117/dsh-ui-usage-billing`，从 npm 安装。这是插件自己文档化的安装路径，也是最小改动，但它否掉了「已发布的构建」：每个部署都得自己跑一遍，而且 pin 是一个版本号而不是可评审的修订。对想在「不内置该插件的部署」里用上仪表盘的用户，这仍然是正确路径。

**把插件自带的 `dsh.bundle.patch` 加进 profile 的 bundle 列表** —— 行会自己出现，不必在这里复述；但那样本仓库就会发布一份它并不读的组合：插件日后多插一行、或删掉这一行，用户拿到的东西变了，这里却没有 diff。写在 Web patch 里的行让挂载点唯一且可见，与 IM、技能市场、MCP 连接器的挂载方式一致。

**fork 或编辑子模块，把仪表盘挂到 fork 自有界面上** —— 每次上游发布都会变成一次合并，而插件本来就已经注册进 fork 宿主声明的这些座位。当时否决；2026-11-08 反转：fork 需要插件自己拥有的产品默认值，以及一张设置菜单里的卡面（[fork 说明](2026-11-08-forked-usage-billing-settings-card.zh.md)）。

**由 fork 编写一个包装包重新渲染仪表盘** —— 等于把整套界面（用量折叠、定价、额度、任务队列、导出）在仓库里复制一遍，且每次上游发布都会漂移。

## 影响

已发布的构建现在无需安装步骤就有用量/计费仪表盘，而一次上游发布退化为一次 pin 推进加一次 lockfile 刷新。账本、快照、对账基准与任务队列文件落在 `$DSH_HOME` 下，因此删掉该行只会让它们留在磁盘上不被读取，重新安装即可再次读到。

代价是工作区安装里多了一个第三方闭包，以及多了一套本仓库「按发布产物运行」而非自行构建的产物。pin 是手工的：这里没有任何东西会发现上游新版本，滞后的 pin 会静默发布旧仪表盘——靠的是 `plugins/README.md` 里的评审步骤。客户端半对冻结种子模块的依赖现在记在两个地方（插件自己的构建 preset 与本仓库进程内 require 表），这是一份软契约：新增一个外置模块会让组装式客户端测试失败，而不是在浏览器里悄悄降级。
