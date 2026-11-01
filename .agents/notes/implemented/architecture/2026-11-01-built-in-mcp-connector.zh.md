# Agent Note: 内置 MCP 连接器，由链接器 tab 内嵌

Status: implemented

[English](2026-11-01-built-in-mcp-connector.md) | 中文

## Problem

Markets 页面的链接器 tab 是四个分类里唯一背后空无一物的一个。它绘制的是 SDKWork 云端商店的 MCP 目录——在已发布的构建里没有内容——外加一个惰性的「我的链接器」按钮；而人们打开这个 tab 想要的能力（连接 MCP Server、完成授权、跨连接查找工具、诊断坏掉的连接）住在第三方 Harness 插件 `dsh-mcp-connector` 里。要够到它，得先找到这个包、执行 `dsh plugin --profile web add dsh-mcp-connector`、再重启宿主。

这个 tab 也不能像技能 tab 绘制 SkillHub 市场那样直接绘制该插件的面板：那个面板是插件 Host 半边所提供页面的 iframe，它会向嵌入它的框架提两个问题（工作空间作用域，以及示例 Prompt 的会话）。在声明的 seat 之外渲染注册的组件，就等于让这两个问题无人回答。

## Decision

`dsh-mcp-connector` 以 `plugins/dsh-mcp-connector` git 子模块的方式链接进本仓库，作为 pnpm workspace 成员加入，并由 Web bundle 自己的 patch 组合。链接器 tab 内嵌该插件提供的面板页，并通过一小段桥回答页面的两个宿主问题。这里不编辑该插件的任何内容。

### 组合

`packages/bundle/web-app/cordis.patch.yml` 携带一行：

```yaml
- id: duhu2000-mcp-connector
  name: 'dsh-mcp-connector'
  config:
    catalogUrl: 'https://cdn.jsdelivr.net/gh/duhu2000/dsh-mcp-connector-registry@main/catalog.json'
```

这一行就是宿主侧的全部集成面。Host 半边注入 `tools`、`storageDomain`、`loader` 与 `workspaceRegistry`——base 与 Web 层本就提供——并拥有连接器目录、连接记录与 OAuth 授权（自己的 storage domain 加 `$DSH_HOME/storages/mcp_connector_grants_v1`）、作用域、三层治理规则，以及一条活连接所对应的受管 `@deepseek-ai/dsh-mcp-client` 条目。传输、stdio 子进程、工具注册、执行与审批链仍由宿主自己的 MCP 客户端拥有；插件从不绕过它。目录 URL 钉在行里而不是交给包的默认值，这样即使默认值以后变了，已发布的构建仍指向公共 registry。

插件把整套界面作为同源页面 `/mcp-connector/ui/` 提供，它自己的面板也是用 iframe 绘制这个页面。浏览器半边注册 `mcp-connector` 这个 keyed `main` 面板，以及与之对应的 `sidebar.panellist` 行。`dsh-sdkwork-desktop-app` patch 覆盖 `dsh-web-app`，因此桌面 profile 继承这一行。

插件自带的 `dsh.bundle.patch` 刻意不加入 profile 的 bundle 列表：web-app 这一行是唯一的挂载点，它的防重复挂载守卫因此无需考虑第二个实例。

### 链接器 tab 内嵌的是页面，而不是组件

`packages/client/ui-sdkwork-markets` 拥有链接器 tab，无法重新声明别人插件的页面：一个 slot 只有一个声明者，而布局拥有 `main`。从 ledger 读取已注册组件（技能 tab 绘制 SkillHub 市场走的那条路）在这里同样不成立——那个组件读取只有它自己的注册才提供的 inject props 与 store，把它画在 seat 之外就等于不带这些参数渲染，插件的页面也就拿不到工作空间作用域、也没有打开 Prompt 的途径。

因此这个 tab 内嵌插件本就发布的页面，做法与插件自己的面板完全一致，并说插件自己的框架协议：

- `mcpConnectorPanel.ts` 声明面板 key（`mcp-connector`）、页面路径（`/mcp-connector/ui/`）与消息名；`mainPanelWatch.ts`——从技能市场的源里抽出来的——是决定 tab 内嵌页面还是显示不可用说明的那次 `main` ledger 实时读取。
- `connectorBridge.ts` 把本应用的工作区/会话快照映射成页面的作用域形状——当前会话所在的 Workspace，否则最近使用的那一个，否则唯一列出的那一个（新部署既没有会话也还没有最近记录）——并把 Prompt 交接委托给 `uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists: 'replace' })`，即工作区界面自己的新建会话能力。该能力在每次交接时解析，而不是在 apply 时解析：它来自可能晚于本页面激活的另一个行，而一个可选能力不应决定本页面能否加载。这里不创建任何会话；没有该能力的组合会在面板内报告交接不可用，而不是什么都不做。
- `McpConnectorSurface.tsx` 只接受来自自己这个 iframe、且来源为本应用同源的这两类请求：作用域描述连接落在哪里，交接会打开会话，因此两者都不能被其他框架或应用窗口本身驱动。
- 页头在这个 tab 上收起自己的搜索框，tab 也没有「我的链接器」入口：面板自带搜索与「已安装」视图，旁边再放一个只会是死掉的装饰。

### 只有一个导航入口

连接器插件会注册自己的侧边栏行，那将是通往本 tab 已内嵌页面的第二个导航入口。因此 markets 插件在 `ctx.sdkworkSidebar` 里把该行声明为已内嵌（`suppressPanel('mcp-connector')`），与技能市场的那次声明并列，作为同一个受 Cordis 管理的 effect：卸载本页面即恢复该行。可选注入（`ctx.inject(['sdkworkSidebar'], …)`）的守卫保持不变，因此没有 fork 列的裸 web 外壳仍能激活。

这里不使用插件自己的 `showSidebarEntry` 配置：那是插件的偏好，而抑制是本页面对「自己是该面板的导航」的声明。即使某个部署把插件的入口重新打开，它仍然只有一个入口，因为该列无论如何都会略过这一行。

### Pin 与更新

gitlink 是 `0aaf140`，即 `v0.2.92` 发布提交（钉住时也是上游 `main` 的 tip）。上游提交了构建产物 `lib/`，包括 `ui/` 下的面板页，而本仓库按发布状态运行这些产物，因此 pin 必须是源码与已提交构建一致的版本；发布 tag 就是这样的点。`.gitmodules` 记录 `branch = main`，因此 `git submodule update --remote plugins/dsh-mcp-connector` 可推进 pin。

### 工作区成员与依赖

`plugins/*` 加入 `pnpm-workspace.yaml`，因此插件作为 workspace 成员链接，bundle 的行按包名解析。它的三个运行时依赖（`cross-spawn`、`undici`、`zod`）装进插件自己的 `node_modules`；它的 DSH peer 解析到本 workspace 的包（`@deepseek-ai/dsh-mcp-client`、`dsh-storage-domain`、`schemastery`、`cordis`）。`plugins/*` 位于 tsdown 构建 glob 之外，因此本仓库的构建不会获得一个自带构建的插件。

### 验证

`packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts` 断言组合出的行（及其钉住的目录 URL）、链接清单的 `dsh.client` web 声明与 `dsh.bundle.patch`、四个已发布文件（两个入口产物、路由模块、面板页）、客户端的 `mcp-connector` main 面板注册、Host 半边的四个注入服务与 `/mcp-connector/ui` 路由、以及两半边各自的框架协议，并证明该检查会拒绝每一种不完整形态，同时断言两个桌面覆盖层都没有停用或改指这一行。

`packages/client/ui-sdkwork-markets/tests/mcp-connector-panel.client.spec.ts` 覆盖面板源（实时、引用稳定、按 key 区分、可释放），并钉住面板 key、页面路径与消息名；`connector-bridge.client.spec.ts` 覆盖作用域映射与交接的每一种拒绝；`mcp-connector-surface.client.spec.tsx` 覆盖框架、不可用说明、两类应答以及来源/来源窗口守卫；页面规格覆盖该 tab、没有该行的部署所见的说明，以及该 tab 上没有本页自己的搜索框与「我的目录」入口。`packages/test-support/client-runtime/tests/assembly-bundle-roster.client.spec.ts` 断言已发布的浏览器行在真实 web profile 的花名册上。`plugins/README.md` 记录更新流程。

## Alternatives considered

**像技能 tab 绘制 SkillHub 市场那样渲染已注册的面板组件** —— 该组件是一个读取 inject props（`startPromptSession`、`workspaceContext`、`workspaceOptions`、`store`）与 presentation 模式的包装，这些都由它自己的注册提供。从页面里绘制它就需要这些 props，而唯一取得它们的方式是复刻插件的注入——那正是本仓库应当读取而不是复述的组件契约。它绘制的页面就是同一个表面，却没有这层耦合。

**基于插件的 HTTP API 另做一个 tab 市场** —— 在本仓库内重写目录网格、连接表单、OAuth 流程、工具工作台与诊断，调用 `/mcp-connector/api`。它重复插件的整个产品表面，并且每个版本都会漂移；插件的页面本就是完整界面。

**打开插件自己的面板而不是内嵌它** —— 一个调用 `layout.selectPanel('mcp-connector')` 的按钮。接线最省事，但那个 tab 里就没有连接器了：四个分类会变成三个表面加一次交接，而市场页面的导航模型（tab 持有其内容）恰恰在人们最刻意打开的分类上被破坏。

**让插件在 tab 之外保留侧边栏行** —— 一个页面两个入口，正是技能 tab 已经为市场否决过的安排。

**放宽 `frameAncestors` 或跨源内嵌** —— 该页面由本 Host 同源提供，插件默认 CSP（`frame-ancestors 'self'`）本就允许。把面板嵌进另一个外壳源是插件自己成文的配置选项，不是本页面可以放宽的事。

## Consequences

已发布的构建现在在链接器 tab 里提供整套 MCP 连接器表面，不需要安装步骤：浏览目录、连接并授权 Server、跨连接搜索工具、治理它们、诊断断掉的连接。四个分类现在都是真实表面，其中三个是别的包自己的面板。

代价是与第三方产物之间的一份软契约：一个面板 key、一个页面路径、四个消息名，只由 bundle 验收用例检查，而不是由类型检查。上游改名会让链接器 tab 变成一个失败的用例（或在被发现之前，变成一个内嵌不了任何东西的 tab），而不是类型错误。这个框架也继承插件自身的限制与其语言解析方式，未经审阅的 pin 会静默发布上一个连接器——这道审阅步骤住在 `plugins/README.md` 里，而不在门禁里。

本笔记沿用 [内置 SkillHub 技能市场](2026-11-01-built-in-skill-market-plugin.zh.md) 与 [技能 tab 直接绘制 SkillHub 市场](2026-11-01-skills-tab-embeds-skill-market.zh.md) 的「链接而非内联」形状，并把后者的 `main` ledger 观察扩展到第二个面板，而不是改变它。
