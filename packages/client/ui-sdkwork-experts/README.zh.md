---
description: "SDKWork 专家市场：内置 331 位专家与 5 个专家团。Host 半边：包内人设库、list_experts/summon_expert/summon_experts 与专家团工具、AI 创建草稿工具、子代理 provider 与 agency-agents 设置命名空间。Browser 半边：带 key 的市场面板（专家画廊、专家团、启停管理）、设置 → 专家页、composer @ 选择器与任务推荐条。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-experts

[English](README.md) | 中文

## Summary

本包就是 SDKWork 专家能力的实现。它随包提供 The Agency 名册的 331 位领域专家与 5 个内置专家团，把专家作为可召唤的专家子代理暴露给模型，并绘制这些专家与专家团的库表面（市场 tab 的云端目录由 `ui-sdkwork-markets` 绘制，读的是同一份 `sdkwork-agents` 目录）：

- **Host 半边** —— 读取包内人设资产（`assets/agency-agents`、`assets/agency-agents-zh`），发布专家库与专家团库，注册 `list_experts`、`summon_expert`、`summon_experts`、`list_expert_teams`、`get_expert_team`、`summon_expert_team` 六个工具，`propose_custom_expert` / `propose_expert_team` 起草工具及其打开编辑器的工具，`## Agency expert mode` 提示词分节，以及保存已启用名册、自定义专家与自定义专家团的 `agency-agents` 设置命名空间。
- **Browser 半边** —— 注册带 key 的 `agency-agents` `main` 面板（含分类分组的专家画廊、专家团、AI 创建入口与启停管理）、侧边栏行、设置 → 专家页、composer `@` 选择器与任务推荐条。
- **Remote 半边** —— `src/remote.ts` 发布 `agencyAgents` Typert 命名空间，浏览器半边通过它读取目录、已启用列表、人设与专家团。

本包是一方包。它此前以 `plugins/sdkwork-dsh-agents` 子模块（`@michengai/dsh-agency-agents` 镜像）固定；本包就是该实现交由本仓库构建的版本，其 `lib/` 是本仓构建产物，而不是上游提交的构建产物。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

把本包作为 `packages/bundle/web-app/cordis.patch.yml` 中的两行挂载：`agency-agents-remote`（`@deepseek-ai/dsh-client-ui-sdkwork-experts/remote`）注册 Typert 命名空间，`agency-agents`（`@deepseek-ai/dsh-client-ui-sdkwork-experts`）以 `config.entryLocation: both` 挂载两个半边。bundle 声明该依赖，`ui-sdkwork-markets` 把注册的 `agency-agents` `main` 面板内嵌为专家 tab 的市场 chip。

停用 `agency-agents` 行会一次性移除工具、提示词分节、设置页、composer 选择器、推荐条与面板；市场 tab 随即显示不可用说明。保存在 `$DSH_HOME` 下的已启用名册、自定义专家与自定义专家团在该行恢复后仍然存在。

`config.root` 让人设库指向 The Agency 名册的外部检出目录而不是包内资产；`config.divisions` 收窄加载的分类，`config.provider` 选择子代理 provider（默认 `spawn`），`config.maxDepth` 限制专家团嵌套深度。

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/index.ts` —— Host 半边：解析目录根、遍历 `assets/agency-agents{,-zh}` 下的人设 markdown、在 `agency-agents` 设置命名空间上构建专家库、创建专家团库与草稿注册表、注册六个召唤/专家团工具与四个 AI 创建工具，并贡献 `## Agency expert mode` 提示词分节。召唤通过 `ctx.subagents` 启动子代理；子代理在 `agent/created` 时收到限定作用域的 `deployment:persona-prefix` 分节与工具黑名单，父会话人设不受影响。
- `src/expert-library.ts` —— 名册合并：只读的包内专家加设置中保存的自定义专家、已启用列表、重名检测与带修订号校验的写入。
- `src/team-library.ts`、`src/team-contract.ts`、`src/team-engine.ts`、`src/team-runtime.ts` —— 专家团聚合、协调者提示词装配，以及 `subagent` 与 `native` 两种执行引擎，含原生队友注册路径。
- `src/creation-tools.ts`、`src/creation-contract.ts` —— 暂存的 AI 创建草稿（`propose_custom_expert`、`propose_expert_team`）与「先校验后落库」流程；本包不自带确认卡，编辑器工具打开宿主卡片与市场面板里的编辑器。
- `src/remote.ts`、`src/remote-contract.ts` —— `agencyAgents` Typert Host 服务与其严格调用描述符：目录、自定义专家 CRUD、已启用列表、人设提示词与专家团 CRUD。`src/client/remote.ts` 是面板挂载的浏览器侧贡献。
- `src/settings-compat.ts`、`src/settings-memory.ts` —— 设置命名空间兼容层、旧设置导入与本地入口位置状态。
- `src/subagent-registry.ts` —— 重启后重新施加人设作用域与工具黑名单的子代理注册表，带退出时刷盘的受限磁盘记录。
- `src/client/index.ts` —— 浏览器半边：带 key 的 `main` 面板、画廊与分类筛选、专家团表面、编辑器、设置页、侧边栏行、composer `@` 选择器与推荐条。
- `src/client/roster.ts` —— 生成的专家索引（slug、英文名、emoji、分类、中英简介），画廊筛选无需加载每个人设正文。

<a id="model-experience"></a>

## Model Experience

### 专家工具与提示词分节

#### What the model sees

本包注册 `list_experts`、`summon_expert`、`summon_experts`、`list_expert_teams`、`get_expert_team`、`summon_expert_team`，以及 AI 创建草稿工具 `propose_custom_expert`、`propose_expert_team`、`open_custom_expert_editor`、`open_expert_team_editor`。它还贡献 `## Agency expert mode` 提示词分节，说明专家名册概念、启用规则、召唤契约与两步创建流程。`list_experts` 只返回按分类分组的名册与简介，不返回人设正文；只有在真正召唤某位专家时才读取其正文（最长 20,000 字符）。

#### Token effect

提示词分节按语言确定、每个会话装配一次，因此保留该行的预设会在每一轮增加固定 token 块。十个工具声明每轮都会带上各自的 JSON schema。一次召唤会启动子代理会话，其首个请求以限定作用域的提示词分节携带专家人设，因此人设成本落在子代理上下文，而不是父上下文。

#### KV Cache effect

提示词分节与工具 schema 在给定语言与已启用名册下保持稳定，因此位于缓存前缀中。改变已启用列表或新增自定义专家的设置写入会改变分节文本与 `list_experts` 结果词汇，从该点起使前缀失效；除此之外，本包不会在会话中途改写 provider 请求。

## Known Limitations and Deferred Work

- **数据面归 `sdkwork-agents` 所有。** 名册、分类、专家团、精选场景与每位专家的展示统计都由 `sdkwork-specs` 初始化、由 `sdkwork-agents` 拥有（每位专家一条受管 agent 记录，另加专家团、人格、展示画像与场景集合表）。Host 半边经 `agencyAgents` Remote（`syncSdkworkCatalog`、`syncSdkworkPersonas`）接收市场页推送的目录覆盖：一旦推送，专家、专家团与人格就替换包内名册，包内资产只作离线回退；没有市场页的组合仍读取包内名册。
- **市场 tab 的画廊已不在本包。** 专家 tab 的云端目录（精选场景、专家 / 专家团、分类 chip、综合 / 最热 / 最新排序与卡片网格）由 `ui-sdkwork-markets` 的 `ExpertsCatalogPage` 绘制，读同一份目录；本包保留 `@` 选择器、六个召唤工具、专家团引擎、设置 → 专家页与 `main` 面板。参考设计中的精选集合与使用统计现在由 `sdkwork-agents` 的目录数据提供，因此本包不再需要为它们编造数据。
- **上游运营方链接已中性化。** 设置页的「查看项目/反馈」按钮指向 SDKWork 站点而不是第三方仓库，因为本包是市场的 SDKWork 实现。
- **专家卡封面未生成。** 专家卡使用包内画像池，而不是为每位专家生成美术图。
