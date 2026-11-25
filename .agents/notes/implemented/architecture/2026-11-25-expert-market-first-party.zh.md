# Agent Note：把专家市场改为一等公民包

Status: implemented

[English](2026-11-25-expert-market-first-party.md) | 中文

## Problem

专家市场——331 位专家名册、5 个专家团、召唤与 AI 创建工具、市场面板、设置 → 专家页与 composer 选择器——此前以 `plugins/sdkwork-dsh-agents` 子模块固定，是 `@michengai/dsh-agency-agents` 的镜像。它发布的是镜像提交的 `lib/` 产物，因此本仓库无法构建、类型检查或测试它实际运行的代码；名册的唯一权威来源是插件自带的 markdown 资产；而产品目标是由 `sdkwork-specs` 初始化专家数据、分类与专家团、由 `sdkwork-agents` 拥有，DSH 插件只做集成表面。

## Decision

专家市场现在是本仓库的一等包 `packages/client/ui-sdkwork-experts`（`@deepseek-ai/dsh-client-ui-sdkwork-experts`），像其他 `packages/*` 成员一样由本仓库构建：

- 源码、资产与构建配置来自镜像的 `1.3.x` 线——也就是子模块原先运行的同一份代码——并按本仓库包约定改造：三个入口（`index`、`remote` 与 `client` bundle）、工作区 peer 边、`clientBundle()` 构建，以及唯一一个仅浏览器第三方输入 `@tabler/icons-react`。缺失的四个 remote 文件（`remote.ts`、`remote-contract.ts`、`client/remote.ts` 与 ambient 类型声明）从该线恢复，包标识、API 路由（`/api/sdkwork/experts/*`）、请求头（`x-sdkwork-client`）与运营方链接都对接到 SDKWork 实现。
- 子模块被完整移除：`.gitmodules` 条目、gitlink、工作树目录、`update:expert-market` / `check:expert-market` 脚本、它们的实现 `scripts/update-expert-market.mjs` 以及 `expert-market-pin` 工作流。`pnpm-workspace.yaml` 删除了 28 条 `@michengai/dsh-agency-agents>@deepseek-ai/*` scoped override——它们只为把独立插件的 peer 边指向本工作区而存在。
- web-app patch 仍以同样两行挂载该内置包（`agency-agents-remote`、带 `entryLocation: both` 的 `agency-agents`），并把包声明为 bundle 依赖。面板 key 保持 `agency-agents`，因为它是专家 tab 内嵌所依赖的唯一契约。
- bundle 验收用例改为读取本次构建的产物，钉住两行与面板 key，并在 `.gitmodules` 或工作树再次提到被移除子模块或旧包名时失败。

## Alternatives considered

**保留子模块，只改 URL。** 代码在本仓库仍不可构建，名册的权威来源仍留在第三方资产树，产品仍运行在本仓库没有任何门禁验证的提交产物上。

**把子模块检出保留成 `plugins/` 下的普通目录。** 插件仍在 `packages/*` 之外，工作区依赖策略、类型检查聚合与构建面都覆盖不到它，而且会存在两份专家市场源码。

**只把浏览器半边迁成包，Host 半边留在子模块。** 两个半边共享契约与 Remote 描述符；跨包拆分需要新的 wire 包，而且召唤工具仍会留在不可构建的代码里。

## Consequences

- 专家市场的构建、类型检查与测试现在都在本仓库运行。`packages/client/ui-sdkwork-experts` 产出 `lib/index.js`、`lib/remote.js` 与 `lib/client.js`；其 README 记录了提示词分节与十个工具的 model/token/KV-cache 影响。
- 本仓库不再依赖 MichengAI 仓库及其发布节奏。修复随本仓库发布，而不是靠一次 pin 更新。
- 专家数据面从「子模块边界」变成普通的功能缺口：名册、分类与专家团由 `sdkwork-specs` 初始化、由 `sdkwork-agents` 拥有。Host 半边可以经 `agencyAgents` Remote（`syncSdkworkCatalog`、`syncSdkworkPersonas`）接收目录覆盖，替换包内名册、专家团与人格，包内资产保留为离线回退。市场页现在会在网关与 IAM 会话就绪后从 Agents App API 拉取目录并推入该覆盖层；只挂载本包而没有该页面的组合仍读取包内名册。
- 市场 UI 不因本笔记改变；参考画廊设计（精选集合、分类导轨、使用统计、专家团兄弟 tab）是另一项改动。

## Verification

`pnpm exec tsc -b packages/client/ui-sdkwork-experts/tsconfig.host.json` 与 `.../tsconfig.client.json` 通过，`pnpm --filter @deepseek-ai/dsh-client-ui-sdkwork-experts run bundle` 产出三个入口。`pnpm exec vitest run packages/bundle/web-app/tests/built-in-expert-market.spec.ts` 四个用例全部通过（组合、子模块移除、不完整形态拒绝、桌面层），`pnpm exec vitest run packages/client/ui-sdkwork-markets/tests` 通过（市场页、内嵌面板与表面契约共 187 个用例）。
