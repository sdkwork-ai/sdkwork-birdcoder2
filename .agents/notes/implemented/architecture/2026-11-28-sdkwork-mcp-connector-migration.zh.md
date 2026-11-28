# Agent Note: SDKWork MCP 连接器取代第三方连接器

Status: implemented

[English](2026-11-28-sdkwork-mcp-connector-migration.md) | 中文

## Problem

连接器 tab 把「我该连哪个 MCP Server」回答了两遍，而且两个答案都不属于本产品。它的首个 chip 内嵌 SDKWork App Store 的 MCP 目录页——另一个应用的店面，因为本部署没有 App Store 的 MCP 记录而只渲染出 `未找到匹配的 MCP 服务` 的空状态。第二个 chip 内嵌 `dsh-mcp-connector`：一个以 `plugins/dsh-mcp-connector` git 子模块固定的第三方插件。那个插件确实拥有真正的连接器市场、连接记录、OAuth/API Key 授权、作用域、治理规则、工具工作台与诊断——但它的目录来自随包的 `catalog/catalog.json` 加公共 jsDelivr registry，于是人看到的货架取决于第三方 CDN 与某个包发布版本的共识，而不是本部署的数据。多出来的 chip 行还让这个 tab 成了唯一一个需要先选「云端目录还是真东西」的市场分类。

连接器数据本身属于 `sdkwork-mcp`：它已经拥有 MCP 领域的表、App API 与生成的 SDK——却完全没有目录表，只有占位的 server 标识。

## Decision

**一个连接器表面，一个目录归属。** 连接器 tab 只有一个视图：SDKWork MCP 连接器的面板页，就地内嵌。`ui-sdkwork-markets` 里删掉了 `云端目录 / MCP 连接器` 子标签行与 App Store MCP 内嵌页，连同它们的 locale key、子标签状态与驱动它们的测试。这个 tab 也只有一行 chrome，而不是两行：面板自带的工具栏——市场 / 已安装 / 工具三个视图（带计数）、搜索框、添加与刷新——搬进应用的分类表头行，与技能 tab 相同的做法。`McpConnectorSurface` 通过帧协议（`host-toolbar`、`host-view`、`host-search`、`host-add`、`host-refresh`、`host-locale`）下发状态与命令，并把面板上报的视图与计数（`host-state`）接回来画 chip；该模式下面板隐藏自己的 `.toolbar`，只保留分类导轨，单独打开面板时仍保留整套工具栏。

**插件成为一方插件。** `dsh-mcp-connector` 收进本仓库，成为 `plugins/sdkwork-mcp-connector`（`@sdkwork/dsh-mcp-connector`）——与其余内置插件一样提交 `lib/` 与 `ui/` 的工作区成员——并移除 git 子模块、它的 `.gitmodules` 条目、gitlink 与 `dsh-mcp-connector` 依赖行。分叉保留连接器的全部功能面与视觉设计（面板页、连接、授权、作用域、治理、工具工作台、诊断），只改四件事：身份、目录来源、版本状态表面（插件随应用发布，不再轮询 npm/GitHub 更新），以及指向上游包与仓库的文档链接。作用域选 `@sdkwork/*` 而不是 `@deepseek-ai/*`：这是从 `plugins/` 挂载的 SDKWork 产品插件，与那里的其他条目一致；而 `@deepseek-ai/*` 名字还会被 `verify-default-product-isolation` 当成默认产品的包，那个校验的包注册表并不发现 `plugins/*`。

**目录住在 `sdkwork-mcp`。** 三张新表——`ai_mcp_catalog_entry`、`ai_mcp_catalog_server`、`ai_mcp_catalog_prompt`——加入 MCP 模块契约（1.1.0 → 1.2.0，活跃表从七张到十张）。连接器目录的数据被一次性忠实导入（七个条目、22 个 server 含一个 stdio 挂载、44 条 prompt）到 `database/catalog/catalog.json`，并由 `tools/mcp_catalog_seed.mjs` 生成 `database/seeds/common/003_mcp_connector_catalog.sql` 与 zh-CN/en-US 显示种子（`--check` 进入种子门禁）。目录需要而既有分类缺少的两类——`finance`、`other`——与其余数据一起种入，目录自己的分类映射到既有分类（`企业数据` → `enterprise`，`法律合规` → `legal`，`效率工具` → `productivity`）。

**插件通过生成的 SDK 读这个数据库。** Rust 路由 crate 暴露两个只读 App API 路由——`GET /app/v3/api/mcp/catalog/entries`（已上架条目，支持 `q` 与 `category_code` 过滤，servers 与 prompts 已内嵌）与 `GET /app/v3/api/mcp/catalog/entries/{entryKey}`——物化进 App OpenAPI 文档，并带进重新生成的 TypeScript 与 Flutter SDK。`lib/sdkwork-catalog.js` 解析部署环境（`ui-sdkwork-env` 设置 → SDKWork 宿主环境变量 → 显式 `catalogApiBaseUrl`/`catalogAccessToken` 覆盖），通过 `@sdkwork/mcp-app-sdk/generated` 调用 `mcp.listCatalogEntries`，翻页到底，把每条记录映射成既有的连接器描述符形状，再交给原本为随包目录服务的审计与合并流水线。插件不再有 `catalog/` 目录，也没有 CDN 回退；最近一次成功加载的目录按产出它的网关归属缓存在插件的 storage domain 里。分享功能的信任根也跟着云端目录走。

**面板画的是应用的主题，而且是扁平的。** 被内嵌页面是独立文档，过去带着自己的一套靛蓝配色、1px 卡片描边与阴影；于是 tab 用应用主题的框架包着看起来像另一个产品的东西，深色应用里也仍由 `prefers-color-scheme` 决定成浅色面板。现在插件的样式表「先读宿主令牌」且扁平——每处表面、文字、强调色、圆角与海拔都读 `--dsw-*` 别名并带 `light-dark()` 回退，卡片无描边无阴影，hover 只改变填充——并由 `ui-sdkwork-markets` 的 `connectorTheme.ts` 在加载与每次主题切换时把宿主别名的计算值与解析后的 `color-scheme` 注入框架文档。因此面板跟随运行中的应用主题、OEM 品牌与任意令牌变化，不需要第二份配色；iframe 元素也带同一个 `color-scheme`，深色应用不会先闪一帧白。

## Alternatives considered

- **保留子模块，只换它的 `catalogUrl`。** 那会留下第三方依赖、它的 npm 更新通道与发布 pin；要求是移除插件，而不是给它换地址。上游目录也会继续压过本部署的数据。
- **用插件自己的存储提供目录，而不是 `sdkwork-mcp`。** 连接器数据是 MCP 领域数据；第二个存储会与 PC/H5/Flutter 表面读取的 App API 漂移，而漂移正是这次迁移要消除的东西。
- **在新客户端包里用 React 重写面板。** 连接器界面承载了大量交互细节（OAuth 流程、作用域、治理、诊断）。重写会交付另一个表面，而不是「同一个表面换数据源」；内嵌既有页面保住了每个功能与视觉设计。
- **把新插件注册成 `@deepseek-ai/dsh-sdkwork-mcp-connector`。** 这与 `packages/*` 的分叉命名契约一致，但默认产品隔离门禁会把未知的 `@deepseek-ai/*` 工作区包当成违规——`plugins/*` 不在它的注册表里——而把注册表扩到四个第三方子模块会连它们的整个依赖闭包一起拉进默认产品检查。
- **保留随包目录作为离线回退。** 它正是让货架与部署不一致的同一批记录的第二份副本。连不上 MCP 服务的部署会看到明确的失败，而不是陈旧货架。

## Consequences

- 本笔记取代 [`2026-11-01-built-in-mcp-connector`](2026-11-01-built-in-mcp-connector.zh.md) 的组装与目录决策（子模块、`catalogUrl` pin、随包目录）；那份笔记中「tab 内嵌页面而不是重声明组件」的框架桥论证仍然成立，两篇互相链接。它也部分取代 [`2026-11-06-markets-cloud-catalog-first`](../feature/2026-11-06-markets-cloud-catalog-first.zh.md)：连接器的 `cloud | connector` 子根不再存在。
- 连接器 tab 只渲染一个面：连接器面板。`packages/client/ui-sdkwork-markets/tests/markets-page.client.spec.tsx` 断言该 tab 直接内嵌面板、不存在 `[data-connectors-subtabs]` 行，并且缺少该行的部署显示不可用提示而不是内嵌一个没人提供的路由。
- `packages/bundle/web-app/tests/built-in-mcp-connector.spec.ts` 钉住新行与新包、两份已发布入口、面板页、路由模块、两半的框架协议、注入的四个 Host 服务、`@sdkwork/mcp-app-sdk` 依赖，以及云端目录模块的 SDK/`ui-sdkwork-env`/读取器契约——并且一旦 `catalog/` 目录回来就失败。
- 市场可用性等于部署 `sdkwork-mcp` 服务的可用性。没有网关时目录为空；网关不可达时上一次缓存的目录继续显示，刷新会报告失败。
- 部署必须同时带上两半：提供两个目录路由的 `sdkwork-mcp` 版本，与读取它们的插件版本。只更新插件会看到空市场；只更新服务对旧客户端没有影响。
- 尚未归属：**目录管理**。三张目录表由 `database/catalog/catalog.json` 生成种子、经 App API 只读；管理台目前仍管理分类与 server，PC 市场仍列 `ai_mcp_server` 行而不是目录条目。因此改货架＝改种子源再跑 `node tools/mcp_catalog_seed.mjs`，与专家目录的 generate/check 工作流一致。
- 插件的 `lib/` 与 `ui/` 已提交，所以连接器实现变更就是本仓库的变更，而不是子模块指针。`plugins/README.md` 记录分叉来源、云端目录的解析顺序与验证命令。
- 发布打包把该插件当作其余工作区链接的插件行：清单仍是 `@deepseek-ai/dsh-web-app` 的 `workspace:*` 依赖，`release:pack:assistant` 会打包它的 tarball（`FORK_PLUGINS` 已加入），打包后的清单把 `@sdkwork/mcp-app-sdk` 固定为 facade 的工作区版本。因此该版本必须先发布：`./generated` 子路径导出与 `mcp.listCatalogEntries` 是 facade 在 `0.1.6` 才有的，注册表上的 `0.1.5` 是目录能力之前的构建。插件不带 `bin`、不带 registry 元数据，也不带上游的测试脚手架。
