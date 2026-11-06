# Agent Note: 内置 SkillHub 技能市场，并接入技能 tab

Status: implemented

[English](2026-11-01-built-in-skill-market-plugin.md) | 中文

## 问题

Markets 页面的技能 tab 此前只有 SDKWork 云端目录，而在已发布的构建里，这个目录在有内容之前是空的：一个人打开「技能」想找一个能装的东西，却什么也没有。SkillHub（`skillhub.cn`）发布了一个规模很大的社区技能库，`@montersy123/dsh-skill-market` 是一个第三方 Harness 插件，可以浏览、搜索并从其中安装——但要够到它，用户得自己找到这个包、运行 `dsh plugin --profile web add @montersy123/dsh-skill-market`，再重启宿主。在用户这么做之前，已发布的构建没有这个界面。

把它做成内置需要同时满足三件事：插件出现在已发布的构建里、无需安装步骤即启用、每次发布都不必把别人的代码重移植一遍。同时还需要 fork 自己的技能界面知道这个市场的存在，因为市场是该插件拥有的整页面板，技能 tab 无法自己绘制它。

## 决策

`@montersy123/dsh-skill-market` 以 `plugins/dsh-skill-market` git 子模块链接进本仓库，作为工作区成员加入 pnpm workspace，并由 Web bundle 自己的 patch 组合。这里不编辑它的任何内容。

### 组合

`packages/bundle/web-app/cordis.patch.yml` 携带一行：

```yaml
- id: montersy-skill-market
  name: '@montersy123/dsh-skill-market'
```

这一行就是宿主演进面的全部。宿主半边注入 `webServer`，注册同源的 `/skill-market/api/*` 前缀（SkillHub 对浏览器不返回 CORS 头，页面无法直接调用它），并拥有安装流程。它可选地注入 `skills`：没有技能注册表的 profile 仍然提供市场数据、也仍然安装到磁盘，只是没有目录可以发布进去。两个服务都不是新增的——base 与 Web 层早已提供。

浏览器半边是普通的 `dsh.client` bundle：`@deepseek-ai/dsh-client-modules` 把 `exports["./client"]` 作为 `/plugins/@montersy123/dsh-skill-market/client.js` 提供，插件把 `skill-market` keyed `main` 面板与匹配的 `sidebar.panellist` 行注册进 fork 的侧边栏，并绑定 DSH 的 locale 服务，所以它的中英文词典跟随 设置 → 常规。`dsh-sdkwork-desktop-app` 覆盖在 `dsh-web-app` 之上，因此桌面 profile 继承这一行，无需第二处声明。

插件自带的 `dsh.bundle.patch` 刻意不加入 profile 的 bundle 列表：web-app 里的这一行就是唯一挂载点，它的双挂载守卫因此永远不必处理第二个实例。

### 与技能系统的集成

这个市场的产品价值在于：装好的技能就是普通技能，而不是市场私有的记录。安装会下载技能的全部文件包、逐路径逐字节校验，写进 `$DSH_HOME/skills/<handle>--<slug>/`——harness 自己的技能根目录，`@deepseek-ai/dsh-skill-filesystem` 本来就会扫描它——然后把同一份定义作为实时运行时注册发布到 `ctx.skills`。注册就是状态：启用与停用映射到 `register`/dispose，而停用同时把目录移出技能根目录，所以文件系统与目录不可能互相矛盾。结果是技能列表、面向模型的目录与运行时都能在无需重启的情况下看到新技能，这一侧不需要第二步集成。

### 技能 tab 的集成

`packages/client/ui-sdkwork-markets` 拥有技能 tab，但它无法重复声明另一个插件的页面：市场注册进布局的 keyed `main` slot，而一个 slot 只能有一个声明者。市场也没有发布客户端控制服务（不同于 `dshmarket` 的 `market` 控制）。

因此这个 tab 通过两个包唯一共享的那份显式契约集成：

- `skillMarketPanel.ts` 声明 `SKILL_MARKET_PANEL_ID = 'skill-market'`，以及一个观察实时 `main` ledger 的源；这个 key 是两个包唯一共享的字符串，而该源发布已注册的面板组件。
- 技能 tab 成为子根，与插件 tab 同构：云端目录打头，SkillHub 市场其后，在其中就地绘制该面板。（chip 顺序已被[每个市场分类都落在云端目录](../feature/2026-11-06-markets-cloud-catalog-first.zh.md)取代。）
- 技能添加菜单里的市场行会切回这个 chip。
- 面板只在已注册时绘制；面板缺失时——无论是该行关闭，还是插件浏览器半边尚未加载——表面会说明市场暂不可用，添加菜单也不列出这一行。
- 由于这个 tab 现在持有该市场的导航，markets 插件在 `ctx.sdkworkSidebar` 中把插件自己的侧边栏行声明为已内嵌（`suppressPanel`），目录因此只有一个入口。

本笔记写下时，这个 tab 还是以移交方式接入市场；[技能 tab 直接绘制 SkillHub 技能市场](2026-11-01-skills-tab-embeds-skill-market.zh.md) 记录了那次改变的原因，以及就地绘制依赖哪些前提。

`packages/client/ui-sdkwork-markets/src/client/skillMarketPanel.ts` 是这份契约的归属地；`packages/bundle/web-app/tests/built-in-skill-market.spec.ts` 读取已发布的 `lib/client.js`，面板 key 或其注册方式一变就失败。

### 设置作为管理面

市场并不是市场技能唯一的管理处：设置 → 技能 页会列出它，并且可以停用它。这能成立，是因为技能系统的两半对事实达成一致，而不是共享同一条注册表记录。市场把每个已安装技能注册为**运行时**技能（provider `skill-market`，source `skill-market`），而运行时 rank（250）压过同一目录的用户级文件系统副本（400），因此胜出的目录行把市场记为来源。宿主按设计把未知的 source 字符串收敛为 `unknown`，所以 `ui-sdkwork-skills` 改按 **provider** 分类：市场安装的技能以独立分组打头，来源显示为「SkillHub 技能市场」。管理使用的仍是每个技能共用的持久化抑制——本页写入 `disabledSkills`，本包的宿主半边把该名字投影成 rank 0 的候选，两个目录随即丢弃它，而文件原地不动。

两个开关回答不同的问题，并且互不同步：市场面板的开关在技能根与停用区之间移动已安装目录，而设置页的开关在目录合并中抑制该名字。这个不对称被记录下来而不是隐藏（[技能设置 README](../../../../packages/client/ui-sdkwork-skills/README.zh.md#known-limitations-and-deferred-work)）；合并后的目录跟随抑制，因为它的候选 rank 更低。被抑制技能的目录行是本包 rank 0 的占位行，因此关闭期间该行保留名字与开关（回到可用的路），但不保留市场的描述、提供方与分组。

### 固定与更新

gitlink 指向 `4cda930`，即 `v2.0.7` 发布提交（在固定时也是上游 `main` 的顶端）。上游提交了自己的构建产物 `lib/index.js` 与 `lib/client.js`，而本仓库按发布物直接运行它们，所以固定点必须是源码与已提交构建一致的版本；release tag 就是这样的点。`.gitmodules` 记录 `branch = main`，因此 `git submodule update --remote plugins/dsh-skill-market` 可推进固定点。

### 工作区成员与依赖

`plugins/*` 加入 `pnpm-workspace.yaml`，插件因此作为工作区成员被链接，bundle 的行也能按包名解析。该包没有自己的运行时依赖；两个半边都是自包含 ESM，浏览器半边只要求基线模块（`react`、`@deepseek-ai/dsh-client-ui-primitives`）。因此工作区成员身份没有给仓库增加需要审查或披露的第三方闭包。`plugins/*` 仍在 tsdown 的构建 glob 之外，仓库构建不会获得一个自带构建的插件。

### 命名

这个插件既不是本仓库编写的，也不在本仓库定制：改名会破坏它自己的构建，并把每次上游更新变成一次重移植。它靠位置（上游没有 `plugins/` 目录）和 gitlink 免于上游冲突——合并无法把它改写成别人的版本。

### 验证

`packages/bundle/web-app/tests/built-in-skill-market.spec.ts` 断言组合行、被链接清单的 `dsh.client` web 声明与 `dsh.bundle.patch`、两个构建入口产物、宿主半边的 `webServer` 注入与 `ctx.skills` 发布，以及客户端的 `skill-market` 面板与侧边栏注册，并证明该检查会拒绝每一种不完整形态；它还断言两层桌面覆盖既不停用也不重新指向该行。`packages/client/ui-sdkwork-markets/tests/skill-market-panel.client.spec.ts` 覆盖面板源（实时、引用稳定、按 key 判定、交付组件、可释放），页面用例覆盖子根、内嵌面板、不可用状态与添加菜单行。管理一侧，`packages/client/ui-sdkwork-skills/tests/skill-market-management.host.spec.ts` 驱动真实的技能注册表：以市场 provider 注册的运行时技能被一次设置提交抑制，并在下一次提交后恢复；技能页用例覆盖市场分组、按 provider 得出的来源标签与开关接线。整套组合装配测试（`packages/test-support/client-runtime`）会在包含该插件浏览器半边的名册上启动。`plugins/README.md` 记录更新流程。

## 考虑过的替代方案

**注册表依赖** —— 用 `dsh plugin add @montersy123/dsh-skill-market` 从 npm 安装。这是市场自己文档里的安装路径，也是最小的改动，但它违背「已发布构建」：每个部署都得自己跑一遍，而且固定点是版本号而不是可审查的版本。对于*想要*把市场装进不内置它的部署的用户，这是正确路径，而不是已发布的默认形态。

**fork 或修改子模块以发布面板控制** —— 即 `dshmarket` 的集成模式（`ctx.market.render()`）。它要求修改本仓库保持只读、可快进更新的包，之后每次上游发布都变成一次合并。面板组件本来就随 `main` ledger 到达，因此不需要额外的控制服务；[后续笔记](2026-11-01-skills-tab-embeds-skill-market.zh.md) 记录了这条路线。

**新写一个 fork 拥有的包装包来渲染市场界面** —— 会在本仓库里复制整个市场界面（目录、详情抽屉、安装流水线），并随每次上游发布漂移。拒绝理由与不把市场 vendor 进来相同。

**让 markets 页面重复声明 `main` slot** —— 技术上可行，但一个 slot 只能有一个声明者，布局已经拥有 `main`；第二份 children 表按设计就是加载失败。keyed 面板也是侧边栏行导航所用的身份，重新宿主会让市场脱离自己的入口。

**为市场单独开一个 mode 或 rail 入口** —— 插件已经注册了自己的侧边栏行，额外 mode 会重复导航，并把产品的技能界面进一步切碎。技能 tab 的 chip 是人们找技能时会看的地方；侧边栏行是市场自己的入口。

## 影响

已发布的构建现在在技能 tab 上提供一个有内容可浏览的技能市场，无需安装步骤；上游发布变成一次固定点提升加一次 lockfile 刷新。装好的技能就是 `$DSH_HOME/skills` 下的普通文件，因此停用或移除插件行之后它们仍然可用；浏览与安装需要访问 `skillhub.cn` 的网络，启用/停用/卸载不需要。

技能 tab 这一章就是市场本身：这个 tab 直接绘制插件注册的面板，因此目录只有一个入口，也没有导航步骤。它取代了本笔记里的移交；[内嵌笔记](2026-11-01-skills-tab-embeds-skill-market.zh.md) 记录了就地渲染依赖哪些前提（无 props 的面板与一条行抑制声明），以及覆盖前者的手工验证。

技能 tab 这一章是启动器，而不是内嵌目录：人会离开本页面，去市场自己的整页面板。这是不修改插件就无法消除的一次导航，也是为保持子模块未修改而接受的取舍。

这一决定部分取代了 [Markets 模式页获得插件 tab 与对话执行的添加入口](../feature/2026-09-07-markets-mode-plugin-plugins-tab-and-add-flows.zh.md) 里的原始 Markets 页面设计：技能 tab 现在是子根，而那条记录描述的是单视图 tab。它与 [以 Git 链接内置 IM 渠道插件](2026-10-09-built-in-im-plugin-via-git-submodule.zh.md) 采用同样的「链接而不 vendor」形态。
