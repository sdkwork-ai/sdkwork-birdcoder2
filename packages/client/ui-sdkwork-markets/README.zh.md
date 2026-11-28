---
description: "浏览 SDKWork 数据库中的插件与技能目录、搜索本地化记录、经 Host 插件管理器安装已发布的插件制品，并管理本地已安装插件。Markets 的四个 tab 连接插件、专家、技能与连接器。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-markets

[English](README.md) | 中文

## 概述

从侧边栏打开 Markets，可以浏览 SDKWork Plugins 目录、经 Host 插件管理器安装目录记录给出的目标，或管理本地已安装的插件。一级 tab 按插件、专家、技能、连接器的顺序排列；四个 tab 各自只有一个视图：插件目录、专家目录、技能目录、连接器面板。

## 目录

- [运行要求](#runtime-requirements)
- [浏览器 bundle](#browser-bundle)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="runtime-requirements"></a>
## 运行要求

keyed 页面使用生成的 SDKWork Plugins App SDK 与 Skills App SDK，并沿用当前网关、语言和共享 IAM token manager。只有 Host 持有应用凭据时才显示远程目录，否则会打开本应用的登录界面。插件目录返回插件制品描述，本包会把 Git 和云盘来源转换成标准插件管理规格，再启动 Host 安装弹窗。技能目录直接从 Skills API 读取市场记录、分类、云端安装记录与包制品。本插件还声明 `slots`、`locale`、`layout`、`sessions`、`workspaces`、`env`、`iam` 和 `theme`。插件创建提示与技能操作通过 sessions 和 workspaces 服务运行。fork 侧边栏注册表仍是可选服务，用于在本页面显示 SkillHub 和 MCP connector 面板时隐藏重复的行。

<a id="browser-bundle"></a>
## 浏览器 bundle

客户端插件只发射一个 `client.js` 闭包，样式为自包含的 CSS modules，字形为内联 SVG。专家目录使用生成的 Agents App SDK，连接器 tab 内嵌 SDKWork MCP 连接器插件自己的面板页，远程专家创建流程嵌入 SDKWork Agents 的创建界面，因此 bundle 会内联这些兄弟检出的源码（加入 workspace 的 `../sdkwork-*` 成员；见仓库的 `pnpm-workspace.yaml`），本地安装也需要这些检出位于本仓库旁边。技能云端目录直接使用生成的 Skills API 客户端，不嵌入 App Store 的技能页。

## 运行时不变量

不发布运行时不变量伴随检查；模式状态保存在布局 store 的声明动作集合中，入口/页面注册遵循 keyed 分发；store/模式一致性直接由本包的客户端行为规格测试覆盖。

## 理解实现

页面在 SDKWork Plugins 目录周围保留插件导航和本地管理视图。目录通过生成的 App SDK 读取插件与分类记录，显示本地化字段，并经现有 Host 安装器安装目录记录给出的目标。添加操作打开来源表单，创建操作仍将提示词派发到新会话。专家、技能与连接器都不再有「云端目录 / 市场」子标签：每个 tab 就是一个目录或一个面板。专家 tab 的「我的专家」页面使用 SDKWork Agents 创建流程处理远程专家，并用引导提示处理本地和个人虚拟机专家。专家、技能和连接器等 SDKWork 云端视图在缺少应用凭据时显示本应用的登录界面。

技能云端目录由 BirdCoder 自己实现，直接读取 Skills API。它展示精选记录、推荐卡片、API 分类、安装量排序、最新排序、已安装筛选与详情对话框。搜索框、已安装筛选与添加入口位于页头：目录服从这个筛选（精选栏也一并服从），把页头 chip 显示的已安装数量发布出去，并在五列推荐网格之上绘制精选栏。搜索和分类由服务端过滤，客户端在加载完所有结果页后排序。添加技能会为与记录版本完全匹配的已发布制品创建云端技能库安装记录；写入未完成时界面会阻止重复请求。该操作不会下载技能，也不会把技能注册到本机运行时；本机安装与执行由 SkillHub 负责。添加成功与一般添加失败使用应用级 Toast，离开技能 tab 后仍能看到反馈；制品版本缺失与目录加载失败保留在页面内。

插件 tab 以 SDKWork Plugins 目录打头。生成的 App SDK 从 SDKWork Plugins 后端数据库读取分类与插件记录。精选卡片和热门列表使用记录中的本地化标题、描述、图标、使用量、制品来源与安装目标。安装把记录的目标交给本包的 Host 适配器：解析云盘下载 URL、验证压缩包校验和，并打开现有插件管理器安装弹窗。同一个适配器把 Host bundle 列表关联回卡片，已安装的记录会显示已安装版本、在目录有更新的注册表版本时提供更新，并可卸载。Host 确认安装、更新或卸载后，适配器把这次变更连同当时使用的目录快照写入后端，使每台设备保留一条持久的安装记录；Host 失败或取消时不写入，写库被拒绝时与 Host 结果分开报告。管理打开本地已安装插件列表，添加打开来源安装器。目录保留搜索、分类筛选和操作行为，本包把它的工具栏放入主分类行，并应用紧凑的页面密度。Host 未开放插件管理、另一个安装正在运行，或记录没有发布安装目标时，目录操作会禁用并说明原因。本包仍替换上游插件页，声明原有七个插件配置 slot，并提供 `pluginNavigation` 服务。SkillHub、专家市场与 MCP 连接器继续内嵌各自的独立面板，并隐藏重复的侧边栏入口。

## Model Experience

无，因为插件不添加提示词内容、工具或会话事件；插件创建与技能操作只把用户撰写的文本作为一次普通的排队文本轮提交。

#### KV Cache effect

无；两条流程除了提交的提示词文本外不产生提供方可缓存的额外内容。

## Known Limitations and Deferred Work

- **空面板** —— 专家视图在 SDKWork 目录有内容前保留 App Store 自己的空状态或建设提示。技能云端目录有明确的加载、失败、重试与筛选无结果状态。连接器 tab 不再内嵌 App Store 的 MCP 页：它的整页就是 MCP 连接器插件自己的面板，货架数据由 `sdkwork-mcp` 应用提供。
- **空的专家花名册** —— 在专家目录 store 落地并供给数据前，「我的专家」页面在空花名册上渲染计数角标与按来源的空状态文案；刚创建的专家出现在 Agents 编辑器里，但尚未进入本花名册。
- **对话执行的创建入口** —— 创建插件与添加市场通过合成提示词执行，因为它们要写文件；失败在会话内呈现，而非页面内。从来源安装插件是直接操作：它运行插件管理器的安装流水线，并在安装弹窗中报告进度。远程专家创建流程是例外：它完全在页面内经嵌入的 Agents 创建界面运行。
- **压缩包与云盘安装属于 Host** —— 页面只传递标准规格，从不下包；下载、解包、限额与 `.plugin-manager/sources` 缓存归 profile 的插件管理器所有。
- **远程专家由网关决定** —— 创建流程的第一步要经 Agents app API 持久化智能体，所以环境服务携带网关之前远程行为禁用；未登录用户在传输闸口遇到登录浮层。
- **插件页交互** —— SDKWork Marketplace 自己管理目录搜索与分类筛选。本包把目录工具栏放入主分类行，并应用紧凑的页面密度。管理打开已安装插件列表，添加打开来源安装器。Host 报告成功后，安装、更新与卸载才按设备同步到后端；数据库保存当时的完整目录快照，因此目录记录日后消失时，仍能用已存快照把该插件记为已更新或已移除。只有技能市场面板已注册时，技能添加菜单才显示通往该面板的入口。
- **SDKWork 目录鉴权** —— Marketplace 需要应用 Access-Token 才能调用 SDKWork Plugins App API。Host 在 IAM 会话或静态环境 token 可用前显示共享登录界面。
- **技能市场同样是访客** —— 目录、其安装/停用/回退流程、持久化以及 SkillHub 代理都属于 `@montersy123/dsh-skill-market`：它以 `plugins/dsh-skill-market` 子模块链接进本仓库，并由 web-app bundle patch 挂载。本页面只提供技能 chip、在该 chip 内渲染该插件注册的面板、把插件自己的侧边栏行声明为已内嵌，以及关闭该行时显示的说明文案；它不重写市场。面板经由 ledger 取得（该插件不发布客户端服务），因此两个包只共享一个字符串——它的 `skill-market` 面板 key；面板组件也必须保持无 props（它被画在其声明 seat 之外）。市场更新随该包发布，其 `skill-market` 面板 key 若改名，由 bundle 验收用例（`packages/bundle/web-app/tests/built-in-skill-market.spec.ts`）发现。
- **MCP 连接器是自带的一方插件** —— 连接器目录、OAuth/API Key 与 `mcpServers` 授权、受管的 `@deepseek-ai/dsh-mcp-client` 条目、作用域、治理规则、工具工作台与诊断都属于 `@sdkwork/dsh-mcp-connector`：它是本仓库的一方插件（`plugins/sdkwork-mcp-connector`，提交 `lib/` 与 `ui/` 产物），由 web-app bundle patch 挂载。连接器货架自己不再随包发布，也不再从公共 CDN registry 拉取：插件 Host 半边用 `sdkwork-mcp` 应用的生成 App SDK（`@sdkwork/mcp-app-sdk`）从该应用的数据库读取目录，凭据取自 `ui-sdkwork-env` 的部署环境设置。本页面只把该插件 Host 半边提供的面板页整页内嵌（连接器 tab 就是这一页，没有额外的「云端目录」子标签），把插件自己的侧边栏行声明为已内嵌，并回答页面的两个宿主问题（工作空间作用域与示例 Prompt 会话）；它不重写连接器的任何部分。面板自己的工具栏——市场 / 已安装 / 工具三个视图（带计数）、搜索框与「添加连接」——由本页的表头行承载（与技能 tab 相同的做法），通过帧协议下发给面板并把面板上报的视图与计数显示成 chip，面板内因此只剩分类导轨，整个 tab 只有一行 chrome。两个包共享四个字符串——`mcp-connector` 面板 key、`/mcp-connector/ui/` 页面路径，以及请求/应答的消息名——bundle 验收用例（`packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts`）针对已发布产物把它们全部钉住，并钉住「目录来自 sdkwork-mcp SDK、没有随包目录」。连接器更新随本仓库发布。
- **专家 tab 就是一个云端目录** —— SDKWork Agents 的专家目录是这个 tab 唯一的视图：精选场景货架、专家 / 专家团切换、综合 / 最热 / 最新排序胶囊、分类 chip 导轨与卡片网格，全部来自 Agents App API（`GET /app/v3/api/ai/expert_divisions`、`/experts`、`/expert_teams`、`/expert_collections`）。一个专家就是一受管 agent，专家团是多个专家，因此两类共用一个页面和一条筛选导轨。该 tab 不再拆成「云端目录」与「专家市场」两个子标签：`ExpertsCatalogPage` 自己绘制两类内容，内置专家包（`@deepseek-ai/dsh-client-ui-sdkwork-experts`）保留目录无法承担的职责——`@` 选择器、六个召唤工具、专家团引擎与它的设置页。本页面因此把该包的侧边栏行声明为已内嵌，专家 tab 成为专家的导航入口；面板 key（`agency-agents`）仍是两个包唯一共享的字符串，`packages/bundle/web-app/tests/built-in-expert-market.spec.ts` 把它与两行组合一起钉住。卡片动作经该包的 `agencyAgents` Remote 执行：「立即体验」先把专家或专家团启用，再用该包自己的引用格式开一个新会话。本页面同时保留目录数据面的触发：把名册、专家团与两种语言的人格推入该 Remote 覆盖层，使该包的工具与选择器与 tab 展示同一份目录。
- **上游页面是回退而非并存** —— fork 组合在本行运行期间隐藏 `ui-plugin-manager`，本行关闭后自动恢复，因此插件表面永远不会渲染两次；手工同时启用两行按设计是加载失败，而不是出现两个插件页。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

提示词派发负责插件创建与技能引导操作。它调用 `ctx.layout.setMode('code')`，通过 workspaces runtime 启动会话，等待新会话成为当前会话，再将合成提示词作为排队文本轮发送。

插件来源表单和 SDKWork Marketplace 共用 `@deepseek-ai/dsh-plugin-manager/source` 校验。生成的 Plugins App SDK 提供目录记录；Host 适配器把 Git 或 Drive 制品描述转换成安装规格，通过同一个 store 和安装弹窗执行。Drive 文件记录携带 SHA-256 校验和，由压缩包安装器验证。

远程专家创建流程运行在 `expertsHost.tsx`——每个 SDKWork 界面包各自持有的会话/端口适配模板：它把 Agents、Memory、Voice、Skills、Knowledgebase、Drive 六个生成客户端绑定到活动网关与 IAM 会话（未登录时请求在登录闸口等待），随环境变化重建，并向创建入口上报网关就绪状态。能力包的创建界面（基础信息对话框与编辑器）按需代码分割加载；知识选择适配器在该界面加载时绑定，因为它的状态住在能力包自己的模块注册表里。

连接器 tab 的框架协议属于 SDKWork MCP 连接器插件而非本包：页面向其父框架索取工作空间作用域（`mcp-connector:workspace-context-request`，加载时与每次请求时都会回答），并要求它把示例 Prompt 打开成一个会话（`mcp-connector:start-session`，以 `mcp-connector:start-session-result` 应答）。`mcpConnectorPanel.ts` 持有这些消息名与面板 key，`connectorBridge.ts` 把本应用的工作区/会话快照映射成作用域——当前会话所在的 Workspace，否则最近使用的那一个，否则唯一列出的那一个——并把交接委托给 `uiWorkspace.startSession(workspaceId, { prompt, whenDraftExists: 'replace' })`，按每次交接解析，因此更晚激活的行仍然有效；这里不创建任何会话。`McpConnectorSurface.tsx` 只接受来自自己这个 iframe、且来源为本应用同源的这两类请求。连接器的 `main` 注册才决定 tab 是否显示面板：这里用的是技能市场同一套 `main` ledger 观察（`mainPanelWatch.ts`），因此两个面板都不需要各自的包提供客户端服务。

被内嵌页面是一份独立文档，因此既不继承本页的样式表也不继承它的配色方案。面板自己的样式表是「先读宿主令牌」的：每一处表面、文字、强调色、圆角与海拔都读 `--dsw-*` 别名并带独立回退（扁平、无边框、无阴影），而 `connectorTheme.ts` 在每次加载与每次主题切换时把这些别名的**宿主计算值**连同解析后的 `color-scheme` 注入面板文档（`--accent` 取 `state-business-primary`，主按钮填充取 `button-primary-fill` + `label-primary-foreground`，主色调取 `state-business-tertiary`），因此应用换主题、换 OEM 品牌或改令牌时面板同步变化，面板不需要第二份配色。`--accent`、`--accent-hover`、`--accent-light` 三个变量名是与已发布产物之间的软契约，与面板 key、框架协议一起由 bundle 验收用例钉住。

主题随应用解析后的模式走，而不是操作系统：注入的 `:root` 声明 `color-scheme`，ifram 元素本身也带同一个 `color-scheme`，深色应用里不会先闪一帧白。

</details>
