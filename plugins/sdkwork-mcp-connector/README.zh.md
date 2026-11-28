---
description: "SDKWork MCP 连接器：由 sdkwork-mcp 应用提供的连接器市场、本机连接记录、OAuth/API Key 授权、连接作用域、工具治理、跨连接工具工作台与连接诊断。"
kind: "plugin-reference"
---

# @sdkwork/dsh-mcp-connector

[English](README.md) | 中文

<a id="summary"></a>
## 概述

SDKWork MCP 连接器把 MCP Server 的连接配置、授权、跨连接工具检索与连接排障收在同一个表面里。它是**本仓库的一方插件**——位于 `plugins/sdkwork-mcp-connector`，与本仓库其余内置插件一样提交 `lib/` 与 `ui/` 产物——由 web-app bundle 默认以 `sdkwork-mcp-connector` 行挂载，因此发布构建（以及在其上打补丁的桌面层）无需安装步骤即具备该表面。

一行承载两半：

- **Host 半边**（`lib/index.js`）拥有本机连接记录、OAuth 2.0 PKCE 授权与 API Key 凭据、连接作用域、三层治理规则，以及一条连接最终变成的受管 `@deepseek-ai/dsh-mcp-client` loader 条目。传输、stdio 子进程、工具注册、执行与审批链仍由 Host 自己的 MCP client 拥有。Host 半边同时把整套连接器界面作为同源页面挂在 `/mcp-connector/ui/`。
- **浏览器半边**（`lib/client.js`）注册 keyed `mcp-connector` 主面板和它的侧边栏行，面板用 iframe 画出上面那个页面。

市场本身**不随插件打包**。连接器目录住在 `sdkwork-mcp` 应用的数据库里（`ai_mcp_catalog_entry`、`ai_mcp_catalog_server`、`ai_mcp_catalog_prompt`），由该应用生成的 App SDK 读取（`@sdkwork/mcp-app-sdk`，见 `lib/sdkwork-catalog.js`）。因此插件不再有 `catalog/` 目录，也没有 CDN 回退：一个部署的连接器货架就是它的 `sdkwork-mcp` 服务所发布的那些记录。

## 目录

- [概述](#summary)
- [云端目录](#cloud-catalog)
- [运行要求](#runtime-requirements)
- [面板集成](#panel-integration)
- [Model Experience](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [分叉来源](#fork-provenance)

<a id="cloud-catalog"></a>
## 云端目录

`lib/sdkwork-catalog.js` 按以下顺序解析部署环境，取第一个给出网关的来源：

1. 插件自己的 `catalogApiBaseUrl` / `catalogAccessToken` 配置（仅供运维与测试）；
2. `ui-sdkwork-env` 设置段里当前环境的 profile（`apiBaseUrl`、`accessToken`）；
3. 宿主进程的 SDKWork 环境变量（`SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` 等，以及 `SDKWORK_ACCESS_TOKEN`）。

随后通过生成的 SDK 调用 `mcp.listCatalogEntries`，翻到最后一页，把每条记录映射成连接器描述符（`entry_key` → `id`，`auth` 原样透传，`servers[]`、`prompts[]`），再交给原本为随包目录服务的审计与合并流水线。本地上下架覆盖、配置注入的描述符与本地安装的描述符保持原有优先级；最近一次成功加载的目录按产出它的网关归属缓存在插件的 storage domain 里，因此重启后面板先渲染货架、再等网络回答。

分享功能的信任根也跟着云端目录走：可分享的连接模板只能引用当前部署确实在发布中的已上架条目。

<a id="runtime-requirements"></a>
## 运行要求

该行在提供 `tools`、`storageDomain`、`loader`、`workspaceRegistry` 的 profile 中激活；只有在 Host 同时提供 `ctx.webServer` 时才存在面板页，因此纯对话部署保留工具但没有可内嵌的页面。Host 半边读取可选的 `settings` 服务（`ctx.get('settings')`）以获得部署环境，且从不强制依赖它。

`pnpm install` 会把工作区自己的 `@deepseek-ai/dsh-mcp-client`、`@deepseek-ai/dsh-storage-domain`、`@deepseek-ai/schemastery`、`@deepseek-ai/cordis` 以及兄弟检出的 `@sdkwork/mcp-app-sdk` 链接进来，并安装插件的三个运行时依赖（`cross-spawn`、`undici`、`zod`）。浏览市场需要访问部署的 `sdkwork-mcp` 服务；连接则由所选厂商要求决定，其凭据永不离开本机。

<a id="panel-integration"></a>
## 面板集成

`ui-sdkwork-markets` 的连接器 tab 就是这个插件的面板页，没有别的内容：页面内嵌 `/mcp-connector/ui/`，把插件的侧边栏行声明为已内嵌，并回答页面向父框架提出的两个问题——新连接默认落在哪个 Workspace，以及示例 Prompt 打开成哪个会话。两个包共享的字符串（`mcp-connector` 面板 key、`/mcp-connector/ui/` 页面路径、框架的消息名）住在 `packages/client/ui-sdkwork-markets/src/client/mcpConnectorPanel.ts`；`packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts` 在任一已发布产物不再声明它们时失败，也会在随包目录重新出现时失败。

**工具栏。** 单独打开时本页自带工具栏（视图切换、搜索、添加、刷新、语言、快速开始）。被连接器 tab 内嵌时，这些控件由应用表头承载（与技能 tab 相同的做法）：收到 `mcp-connector:host-toolbar` 后本页隐藏 `.toolbar`，改为接受 `host-view`、`host-search`、`host-add`、`host-refresh`、`host-locale`，并用 `host-state` 回报当前视图与计数。因此整个 tab 只有一行 chrome，面板内只剩分类导轨。

**主题。** 本页样式表是「先读宿主令牌」且扁平的：卡片无描边、无阴影，hover 只靠填充变化，每处表面、文字、强调色、圆角与海拔都读 `--dsw-*` 别名并带 `light-dark()` 回退，因此单独打开也自洽。被应用内嵌时，`ui-sdkwork-markets` 的 `connectorTheme.ts` 在每次加载与主题切换时把宿主别名的计算值与解析后的 `color-scheme` 注入本文档，面板因此跟随运行中的应用主题（含 OEM 品牌），而不是操作系统偏好。

<a id="model-experience"></a>
## Model Experience

插件保留 `mcp_connector_*` 工具族：目录浏览、连接配置、凭据配置、JSON 导入、脱敏导出、快照/恢复、URL 安装、状态、启停、断开、目录刷新与本地上下架。每个工具描述只使用模型需要的连接器词汇，不涉及 Host 或传输细节。`compactManagementTools: true` 时该族收敛为发现与会话两个入口。

#### KV Cache effect

除工具定义本身外没有额外影响。目录是工具按需读取的数据，不贡献提示词段落，也不产生会话事件。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **市场可用性取决于部署的 MCP 服务。** 没有配置网关时目录为空，面板会说明失败原因；这里刻意不提供随包回退，因为同一批记录的第二份副本正是这次迁移要消除的漂移。
- **打包发布需要注册表上有对应的目录 SDK。** 打包后的插件清单把 `@sdkwork/mcp-app-sdk` 固定为 facade 在工作区里的确切版本（当前 `0.1.6`，它带有本插件导入的 `./generated` 子路径导出与 `mcp.listCatalogEntries` 操作）。发布前须由 `sdkwork-mcp` 先发布该版本；`release:pack:assistant` 已包含本插件自己的 tarball。
- **一个面板页、一个 iframe。** 连接器 tab 内嵌同源页面，而不是把连接器界面重写成 React 组件；这样完整保留了连接器的每个功能与视觉设计，代价是多一个文档。
- **版本检查只报告本机事实。** 插件随应用发布，设置里的版本区块只报告安装版本，不做 npm 或 GitHub 查询。
- **未携带上游的测试脚手架。** 分叉只带 `lib/`、`ui/` 与本文档；上游仓库的营销物料、registry 工具与 `node --test` 套件不属于本检出。

<a id="fork-provenance"></a>
## 分叉来源

实现是 [`duhu2000/dsh-mcp-connector`](https://github.com/duhu2000/dsh-mcp-connector)（v0.2.120，MIT——见 [LICENSE](LICENSE)）的分叉，收进本仓库并改名为带 `sdkwork` 标记的插件。连接器界面、连接模型、授权流程、作用域、治理与诊断属于该项目的工作；本仓库改的是目录来源（从随包 JSON + CDN registry 改为 `sdkwork-mcp` App SDK）、插件身份与版本状态表面（不再轮询第三方更新）。上游的目录数据已导入 `sdkwork-mcp` 的数据库初始化种子，因此市场在运行时不再依赖上游包。
