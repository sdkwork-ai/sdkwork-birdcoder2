---
description: "Markets 应用模式插件：插件市场快捷入口与 keyed 的中心列页面，页头 tab 承载插件、专家、技能、链接器目录；插件 tab 还提供添加入口（skill 引导的插件创建与插件市场录入弹窗）。插件 tab 以社区插件市场（dshmarket 插件自己的目录）打头，其后才是云端目录与本部署的插件视图，并默认落在插件市场；该插件表面替换上游插件页。技能 tab 以 SkillHub 技能市场（独立的 @montersy123/dsh-skill-market 插件自己的面板，直接内嵌渲染）打头，其后是云端技能目录，并抑制该插件自己的侧边栏行，使市场只保留一个入口。链接器 tab 就是 MCP 连接器本身：dsh-mcp-connector 插件的面板页被就地内嵌，由一小段宿主桥回答其两类请求，并抑制该插件自己的侧边栏行，使连接器只保留一个入口。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-markets

[English](README.md) | 中文

## 概述

Markets 应用模式插件拥有 `markets` 侧边栏快捷入口与 keyed 的 `mode.page` 页面。页头左侧是分类 tab 栏（插件、专家、技能、链接器），右侧是目录工具：按分类搜索框，以及插件 tab 上的添加入口。添加触发器打开两项菜单：「创建插件」把技能引导的创建提示词派发到新会话；「添加插件市场」打开录入弹窗，记录市场的来源（GitHub `owner/repo`、Git URL 或本地文件夹，含可选的 Git 引用与稀疏检出路径），并把合成提示词作为一次派发提交。两条流程共用同一提示词派发通道，因为 harness 尚无可直接调用的市场 API。专家 tab 的「我的专家」入口打开整页「我的专家」视图：花名册 tab（专家、专家团）带各自计数、「我创建的/我购买的」来源切换，以及「创建专家」触发器——其 hover 菜单列出三种专家类型。远程类型走 SDKWork Agents 的创建流程：先弹能力包的基础信息对话框（名称、头像、类型、简介），再以整页替换进入智能体编辑器（系统提示词、模型、记忆、能力、预览调试），全程经由嵌入式创建专家宿主适配器；本地与个人虚拟机类型保持原有行为，把引导创建提示词派发到新会话。未配置网关时远程行为禁用态。页面是公共的：未登录即可渲染，不挂载 IAM 会话面；创建流程的后端调用在传输闸口等待登录浮层完成。

插件 tab 就是本产品的插件表面。它的子 tab 行以**插件市场**打头——即 `dshmarket` 插件提供的社区目录；Web 组合把它钉在依赖里并挂在自己的 patch 上，所以出货构建无需安装步骤就有它——由该插件发布的 `market` 控制服务渲染（`render({ surface: 'plugins' })`），并且这个 chip 就是落地视图：打开插件页、每次重新进入都落在它上面；其后是**云端目录**（SDKWork App Store 的插件目录），再往后是本部署自己的 `official` 与 `installed` 视图：官方/已安装插件包、每个插件包自己的 `plugins.bundle.config` 表单、它所声明的组件及其逐行开关、安装弹窗，以及插件包启用后的 `plugins.bundle.activation` 指引。市场自带搜索、分类、安装弹窗、更新、备份与诊断，所以本页面不在它外面再画一层页面框架、也不重复其中任何一项：该 chip 激活时页面**保留「添加」菜单**（创建插件 / 添加插件市场），只收起自己的搜索框——市场页面已有搜索，再放一个失效的搜索框只会读作坏掉。该市场服务天生是可选的：patch 把该行关掉、或根本没有组合 Web bundle 的部署保留打头的 chip 并显示安装入口，走与本地视图相同的安装流水线；已持有插件包但浏览器半边尚未加载的部署则显示刷新页面的提示；被停用的插件包会被送回「已安装」列表，而不是让人反复刷新。不管理插件包的部署永远不会看到这个安装入口。本包**替换**上游插件页而非与其并存：它声明上游页面声明过的七个插件配置 seat——一个 slot 只能有一个声明者，为同一个 key 再提交一份 children 表会让客户端拒绝加载——并提供上游页面提供过的 `pluginNavigation` 服务，因此向这两个表面贡献的插件都无需改动。组合在本行运行期间隐藏 `ui-plugin-manager`，本行关闭后自动恢复，所以启用的插件表面永远只有一个页面。技能 tab 同理也是一层子根：打头的 chip 是 **SkillHub 技能市场**——独立的 `@montersy123/dsh-skill-market` 插件自己的 `main` 面板，本页直接把它画在 chip 里，而不是重写它——云端技能目录保留第二个 chip。市场就是本 tab 的内容而不是一个去处：本页取该插件注册的面板并在 chip 的表面内渲染；由于这个 tab 现在持有该市场的导航，它同时把插件自己的侧边栏行声明为已内嵌，市场因此只有一个入口。面板只在它已注册时绘制——该行关闭、或插件浏览器半边尚未加载时——此时 chip 的表面改为说明市场暂不可用，而不是留一个空白 tab；添加菜单里的市场行会切回这个 chip，而不是离开本页。该插件把技能下载到 harness 的技能根目录，并发布到运行中的 `ctx.skills` 注册表，因此装好的技能不需要第二步集成：技能设置页会列出它，模型也能直接调用。专家保持单视图体验。链接器 tab 就是 **MCP 连接器**——独立的 `dsh-mcp-connector` 插件自己的表面：它的 Host 半边把整套连接器界面作为同源页面 `/mcp-connector/ui/` 提供，本 tab 就地内嵌该页面，与该插件自己的面板做法完全一致。连接器市场、连接记录及其 OAuth/API Key 授权、跨连接工具工作台、作用域与治理规则、连接诊断都归该包所有；本页只提供框架，以及页面向宿主询问的两件事——新连接默认落在哪个工作空间，以及示例 Prompt 打开哪个会话——并声明该插件的侧边栏行为已内嵌，使连接器只保留一个导航入口。没有这一行的部署会看到不可用说明，而不是一个指向无人提供路由的框架。

## 目录

- [运行要求](#runtime-requirements)
- [浏览器 bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

## 运行要求

插件通过 `ctx.slots` 注册侧边栏入口与 keyed 页面、通过 `ctx.locale` 注册字典、通过 `ctx.layout` 完成模式切换。页面是公共的：未登录即可渲染，不挂载 IAM 会话面，因此登录前即可浏览目录。插件声明 `slots`、`locale`、`layout`、`sessions`、`workspaces`、`env`、`iam` 与 `theme`。添加入口需要 sessions 与 workspaces 服务：派发时把框架切到 `code` 模式、运行共享的新会话流程、（有界）等待新会话成为当前会话，再把合成提示词作为排队文本轮发送进去。插件市场的控制服务按可选依赖消费（`ctx.inject(['market'], …)`）：它由 Web 组合在激活时挂上的 `dshmarket` 插件提供，因此页面等待它而非强制依赖它，并随该插件的加载/卸载而挂上或摘除。本插件同样以可选服务方式消费 fork 侧边栏的行注册表（`ctx.inject(['sdkworkSidebar'], …)`）：该列挂载时，本插件在其中声明已内嵌的 skill-market 与 MCP 连接器面板，从而把两者各自插件自己的行挡在该列之外；没有 fork 列的裸 web 外壳本来就没有面板列表可过滤。连接器面板的 Prompt 交接以可选服务方式读取工作区界面的新建会话能力（`ctx.get('uiWorkspace')`）：没有该能力的组合会在面板内报告交接不可用，而不是静默什么都不做；工作空间作用域本身来自本插件已注入的快照。

## 浏览器 bundle

客户端插件只发射一个 `client.js` 闭包，样式为自包含的 CSS modules，字形为内联 SVG。市场页面嵌入 SDKWork App Store 的 PC 界面，远程专家创建流程嵌入 SDKWork Agents 的创建界面，因此 bundle 会内联这些兄弟检出的源码（加入 workspace 的 `../sdkwork-*` 成员；见仓库的 `pnpm-workspace.yaml`），本地安装也需要这些检出位于本仓库旁边。

## Model Experience

提示词派发通道只把用户撰写的文本作为排队文本轮提交；插件本身不添加提示词内容、工具或会话事件。实际的插件创建（由可用的插件创建技能引导）与市场添加（拉取仓库、按需稀疏检出并读取插件清单）由对话代理执行。

#### KV Cache effect

无；两条流程除了提交的提示词文本外不产生提供方可缓存的额外内容。

## Known Limitations and Deferred Work

- **空面板** —— 专家与技能云端面板在各自的真实目录界面上线前渲染建设提示或空状态。链接器 tab 不属于这一类：它内嵌的是 MCP 连接器插件自己的页面。
- **空的专家花名册** —— 在专家目录 store 落地并供给数据前，「我的专家」页面在空花名册上渲染计数角标与按来源的空状态文案；刚创建的专家出现在 Agents 编辑器里，但尚未进入本花名册。
- **对话执行的添加入口** —— 创建插件与添加市场通过合成提示词执行，因为尚无直接宿主市场 API；失败在会话内呈现，而非页面内。远程专家创建流程是例外：它完全在页面内经嵌入的 Agents 创建界面运行。
- **远程专家由网关决定** —— 创建流程的第一步要经 Agents app API 持久化智能体，所以环境服务携带网关之前远程行为禁用；未登录用户在传输闸口遇到登录浮层。
- **仅插件 tab 的添加触发器** —— 添加触发器挂在插件 tab（插件市场与云端目录都有）；专家 tab 的「我的专家」入口打开「我的专家」页面，链接器 tab 没有该入口，因为连接器面板自带「已安装」视图。插件市场 chip 激活时触发器仍留在页头，只收起本页的搜索框，因为市场页面自带搜索。技能 tab 的两个 chip 各自挂载自己的添加触发器；其中的市场行会切回技能市场 chip，并且只在该技能市场面板已注册时出现，菜单因此不会列出一个显示不出来的去处。
- **插件市场是访客** —— 社区目录、其安装/更新/备份流程与诊断都属于 `dshmarket`；Web 组合把它钉在依赖里并挂在自己的 patch 上，所以出货构建无需安装步骤就能打开该目录。本页面只提供 tab 与视口、渲染该插件发布的服务、提供安装与刷新入口；它不重写也不锁定市场行为，因此市场更新随该 pin 的版本升级。控制契约——服务名 `market`、契约版本 1、`render` 方法——由 `packages/bundle/web-app/tests/built-in-plugin-market.spec.ts` 针对已发布产物钉住；市场若改掉它，本页会先回落到安装/刷新入口，直到本页跟上。安装入口只在宿主管理插件包的部署上出现。
- **技能市场同样是访客** —— 目录、其安装/停用/回退流程、持久化以及 SkillHub 代理都属于 `@montersy123/dsh-skill-market`：它以 `plugins/dsh-skill-market` 子模块链接进本仓库，并由 web-app bundle patch 挂载。本页面只提供技能 chip、在该 chip 内渲染该插件注册的面板、把插件自己的侧边栏行声明为已内嵌，以及关闭该行时显示的说明文案；它不重写市场。面板经由 ledger 取得（该插件不发布客户端服务），因此两个包只共享一个字符串——它的 `skill-market` 面板 key；面板组件也必须保持无 props（它被画在其声明 seat 之外）。市场更新随该包发布，其 `skill-market` 面板 key 若改名，由 bundle 验收用例（`packages/bundle/web-app/tests/built-in-skill-market.spec.ts`）发现。
- **MCP 连接器是第三个访客** —— 连接器目录、OAuth/API Key 与 `mcpServers` 授权、受管的 `@deepseek-ai/dsh-mcp-client` 条目、作用域、治理规则、工具工作台与诊断都属于 `dsh-mcp-connector`：它以 `plugins/dsh-mcp-connector` 子模块链接进本仓库，并由 web-app bundle patch 挂载。本页面内嵌该插件 Host 半边提供的面板页、把插件自己的侧边栏行声明为已内嵌，并回答页面的两个宿主问题（工作空间作用域与示例 Prompt 会话）；它不重写连接器的任何部分。两个包共享四个字符串——`mcp-connector` 面板 key、`/mcp-connector/ui/` 页面路径，以及请求/应答的消息名——bundle 验收用例（`packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts`）针对已发布产物把它们全部钉住。连接器更新随该包发布。
- **上游页面是回退而非并存** —— fork 组合在本行运行期间隐藏 `ui-plugin-manager`，本行关闭后自动恢复，因此插件表面永远不会渲染两次；手工同时启用两行按设计是加载失败，而不是出现两个插件页。

### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

提示词派发是两条添加入口的唯一执行通道：先调用 `ctx.layout.setMode('code')`，再经工作区 provision 的 runtime 面调用 `ctx.workspaces.startSession()`，在有界超时内等待 `ctx.sessions.list` 落地一个新的当前会话后才发送提示词。若没有会话落地（连接失败、无工作区），框架停留在会话界面，用户可直接操作。添加市场弹窗通过模板替换合成提示词，空白引用与稀疏路径字段使用 locale 属主的回退文案。

远程专家创建流程运行在 `expertsHost.tsx`——每个 SDKWork 界面包各自持有的会话/端口适配模板：它把 Agents、Memory、Voice、Skills、Knowledgebase、Drive 六个生成客户端绑定到活动网关与 IAM 会话（未登录时请求在登录闸口等待），随环境变化重建，并向创建入口上报网关就绪状态。能力包的创建界面（基础信息对话框与编辑器）按需代码分割加载；知识选择适配器在该界面加载时绑定，因为它的状态住在能力包自己的模块注册表里。

链接器 tab 的框架协议属于连接器插件而非本包：页面向其父框架索取工作空间作用域（`mcp-connector:workspace-context-request`，加载时与每次请求时都会回答），并要求它把示例 Prompt 打开成一个会话（`mcp-connector:start-session`，以 `mcp-connector:start-session-result` 应答）。`mcpConnectorPanel.ts` 持有这些消息名与面板 key，`connectorBridge.ts` 把本应用的工作区/会话快照映射成作用域——当前会话所在的 Workspace，否则最近使用的那一个，否则唯一列出的那一个——并把交接委托给 `uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists: 'replace' })`，按每次交接解析，因此更晚激活的行仍然有效；这里不创建任何会话。`McpConnectorSurface.tsx` 只接受来自自己这个 iframe、且来源为本应用同源的这两类请求。连接器的 `main` 注册才决定 tab 是否显示面板：这里用的是技能市场同一套 `main` ledger 观察（`mainPanelWatch.ts`），因此两个面板都不需要各自的包提供客户端服务。

</details>

## 运行时不变量

不发布运行时不变量伴随检查；模式状态保存在布局 store 的声明动作集合中，入口/页面注册遵循 keyed 分发；store/模式一致性直接由本包的客户端行为规格测试覆盖。
