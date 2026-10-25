# Agent Note：dsh-llm-pi-ai 随包发布的中转提供方

Status: implemented

[English](2026-08-16-llm-pi-ai-harness-relay-providers.md) | 中文

## 问题

产品需要把 `sdkwork` 与 `birdcoder`——两个像 OpenRouter 一样的 OpenAI 兼容中转服务，端点分别为 `https://api.sdkwork.com/v1` 与 `https://api.birdcoder.com/v1`——作为提供方接入"模型"设置页，并具备与 `openrouter` 这类目录提供方完全一致的现成体验：未配置前就出现在"添加提供方"下拉中，填入 API 密钥后启用，可用于所有主流模型。这两条路由都不在已安装的 pi-ai 目录里，而 pi-ai 不提供的路由通常要由部署方在 `settings.yaml` 里逐条声明——那样 sdkwork/birdcoder 在用户手工写 profile 之前不会出现。BirdCoder 的网关以 Claude Code 为先：默认提供 Anthropic Messages，同一主机还提供 OpenAI Responses（Codex）与 Chat Completions。

## 决策

把两条中转路由作为 harness 侧的目录成员放进 `packages/llm/llm-pi-ai` 包内——不新建包、不改 `LlmRuntime`/Service Definition、不改任何 UI（可配置提供方目录与"模型"页会像渲染任何目录路由一样渲染它们）：

- **harness 中转目录。** `relay.ts` 新增 `HARNESS_RELAYS`：`sdkwork`（`https://api.sdkwork.com/v1`，`api: openai-completions`）与 `birdcoder`（`https://api.birdcoder.com/v1`，默认 `api: anthropic-messages`），displayName 为 `SDKWork`/`BirdCoder`，共享一份主流模型 id 种子（`openai/gpt-4o`、`anthropic/claude-opus-4.5`、`deepseek/deepseek-v4-flash`、`google/gemini-2.5-pro`、`qwen/qwen3.7-max`、`z-ai/glm-4.6`、`moonshotai/kimi-k2`、`x-ai/grok-4.5` 等）。每个种子模型借用已安装 openrouter 目录同名条目的既有事实（名称、容量、模态、推理分发），盖印成该路由的默认协议与端点，因此种子保持准确而不重复目录数据；借来的 `compat` 块只在该条目与使用协议一致时才随行，pi-ai 升级若删掉某个种子 id，会点名报错而非静默少模型。`catalog.ts` 在 `catalogProvider()`、`catalogProviderIds()`（排序后返回）与 `catalogModels()` 中纳入中转条目，`directoryEntries`、`resolveRouteModels` 与 `buildProvider` 的目录复用路径因此无需改动。`harnessApiKeyAuth` 现在位于 `relay.ts`，与两个消费方共享的 provider 构造放在一起。
- **协议面。** 每条中转条目同时声明 OpenAI 兼容的 `/v1` 端点与 Anthropic 的 `/anthropic` 端点。OpenAI 面在 `/v1` 后追加 `/chat/completions` 或 `/responses`；Anthropic SDK 追加 `/v1/messages`，所以 BirdCoder 默认的 Messages 面是 `https://api.birdcoder.com/anthropic`。中转 profile 若写 `api: openai-responses`（Codex）或 `api: openai-completions`，会解析到该协议的协议面而无需重写 `baseURL`；profile 显式给出的 `baseURL` 仍然优先，未写协议的 profile 则沿用种子的协议面。
- **profile 解析。** `resolveProfiles` 的 displayName 回退到 harness 条目，配置后的卡片显示 `SDKWork`/`BirdCoder`；休眠下拉仍与所有目录路由一致显示路由 id。目录条目的 `defaultBaseURL` 是默认协议的协议面，因此卡片显示的就是请求实际使用的端点。
- **"获取模型"询问中转端点。** 种子只是精选子集而非权威列表，因此 `discoverModels` 把 harness 路由排除在已安装目录短路之外，改问 `GET {baseURL}/models`；草稿未给（或清空）端点时回退到随包端点。"模型"页的"获取模型"按钮因此能拉到中转站支持的全量模型列表。
- **密钥约定。** "模型"页按派生引用 `SDKWORK_API_KEY` / `BIRDCODER_API_KEY` 存储密钥（`deriveKeyRef`）；无头部署在 settings 里写 `sdkwork: { apiKeyEnv: SDKWORK_API_KEY }` 即可。

## 备选方案

| 已否决 | 一句话理由 |
|---|---|
| 在 base bundle 的 `cordis.patch.yml` 里声明两条路由 | 会变成某个 bundle 的默认激活组合事实而非目录公民；挂载 `llm-pi-ai` 的无头/裸部署拿不到它们，休眠下拉（"像 openrouter 一样"的体验）也不会提供它们 |
| 新建独立 `llm-sdkwork` 包 | 整套 pi-ai 适配器被复制；两条中转都是通用适配器已能服务的普通网关 |
| 只在用户手工填了 baseURL 后才走端点拉取 | harness 路由本来就有随包端点；让用户为"获取模型"重打一遍地址，与目录路由的姿态相悖 |

## 后果

所有挂载 `llm-pi-ai` 的组合（web/desktop bundle 以休眠方式挂载它）的"模型"页提供方下拉都会出现 `sdkwork` 与 `birdcoder`。BirdCoder 默认协议是 Anthropic Messages；切到 Codex Responses 或 Chat Completions 只需在 profile 里改 `api`，端点会随协议切换。种子清单与漂移门位于 `relay.ts`；协议风格或端点不同的中转照常按 profile 逐项覆盖。base bundle 的休眠注释与 `agent-default-model` 不变——sdkwork/birdcoder 配置前保持休眠，默认 agent 模型仍是 `deepseek-official`。

## 测试

`catalog.spec.ts` 钉住目录成员与种子盖印、休眠目录条目（`declared: false`，其 `defaultBaseURL` 为默认协议的协议面）、经 mock 服务器的端到端 Anthropic Messages 流式请求、协议面切换（`openai-responses` 与 `openai-completions` 在不重写端点的情况下解析到 `/v1`）、两个流方法都委托给中转 provider、空 profile 解析与 displayName 回退、以及种子漂移门（`vi.resetModules` + `vi.doMock` pi-ai providers 模块，置于文件末尾）。`discovery.spec.ts` 钉住 harness 路由的端点询问（绝不走种子短路）与草稿 baseURL 缺失/清空时的随包端点回退。`models-settings.e2e.ts` 断言添加提供方下拉包含这两个选项；模型设置与新手引导的 golden 快照选项列表也包含它们。
