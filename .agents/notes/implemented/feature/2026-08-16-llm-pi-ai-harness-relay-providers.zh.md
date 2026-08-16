# Agent Note：dsh-llm-pi-ai 随包发布的中转提供方

Status: implemented

[English](2026-08-16-llm-pi-ai-harness-relay-providers.md) | 中文

## 问题

产品需要把 `sdkwork` 与 `birdcoder`——两个像 OpenRouter 一样的 OpenAI 兼容中转服务，端点分别为 `https://api.sdkwork.com/v1` 与 `https://api.birdcoder.com/v1`——作为提供方接入"模型"设置页，并具备与 `openrouter` 这类目录提供方完全一致的现成体验：未配置前就出现在"添加提供方"下拉中，填入 API 密钥后启用，可用于所有主流模型。这两条路由都不在已安装的 pi-ai 目录里，而 pi-ai 不提供的路由通常要由部署方在 `settings.yaml` 里逐条声明——那样 sdkwork/birdcoder 在用户手工写 profile 之前不会出现。

## 决策

把两条中转路由作为 harness 侧的目录成员放进 `packages/llm/llm-pi-ai` 包内——不新建包、不改 `LlmRuntime`/Service Definition、不改任何 UI（可配置提供方目录与"模型"页会像渲染任何目录路由一样渲染它们）：

- **harness 中转目录。** `catalog.ts` 新增 `HARNESS_RELAYS`（`sdkwork`、`birdcoder`；displayName 为 `SDKWork`/`BirdCoder`，各自端点，`api: openai-completions`），共享一份主流模型 id 种子（`openai/gpt-4o`、`anthropic/claude-opus-4.5`、`deepseek/deepseek-v4-flash`、`google/gemini-2.5-pro`、`qwen/qwen3-max`、`z-ai/glm-4.6`、`moonshotai/kimi-k2`、`x-ai/grok-4.5` 等）。每个种子模型借用已安装 openrouter 目录同名条目的既有事实（名称、容量、模态、推理分发），并把端点盖印成该路由自己的地址，因此种子保持准确而不重复目录数据；pi-ai 升级若删掉某个种子 id，会点名报错而非静默少模型。`catalogProvider()`、`catalogProviderIds()`（排序后返回）、`catalogProviderTakesApiKey()` 与 `catalogModels()` 都纳入 harness 条目，`directoryEntries`、`resolveRouteModels` 与 `buildProvider` 的目录复用路径因此无需改动。`harnessApiKeyAuth` 从 `provider.ts` 移入 `catalog.ts`（两个消费方都在那里，无循环导入）。
- **profile 解析。** `resolveProfiles` 的 displayName 回退到 harness 条目，配置后的卡片显示 `SDKWork`/`BirdCoder`；休眠下拉仍与所有目录路由一致显示路由 id。
- **"获取模型"询问中转端点。** 种子只是精选子集而非权威列表，因此 `discoverModels` 把 harness 路由排除在已安装目录短路之外，改问 `GET {baseURL}/models`；草稿未给（或清空）端点时回退到随包端点。"模型"页的"获取模型"按钮因此能拉到中转站支持的全量模型列表。
- **密钥约定。** "模型"页按派生引用 `SDKWORK_API_KEY` / `BIRDCODER_API_KEY` 存储密钥（`deriveKeyRef`）；无头部署在 settings 里写 `sdkwork: { apiKeyEnv: SDKWORK_API_KEY }` 即可。

## 备选方案

| 已否决 | 一句话理由 |
|---|---|
| 在 base bundle 的 `cordis.patch.yml` 里声明两条路由 | 会变成某个 bundle 的默认激活组合事实而非目录公民；挂载 `llm-pi-ai` 的无头/裸部署拿不到它们，休眠下拉（"像 openrouter 一样"的体验）也不会提供它们 |
| 新建独立 `llm-sdkwork` 包 | 整套 pi-ai 适配器被复制；两条中转都是通用适配器已能服务的普通 OpenAI 兼容网关 |
| 只在用户手工填了 baseURL 后才走端点拉取 | harness 路由本来就有随包端点；让用户为"获取模型"重打一遍地址，与目录路由的姿态相悖 |

## 后果

所有挂载 `llm-pi-ai` 的组合（web/desktop bundle 以休眠方式挂载它）的"模型"页提供方下拉都会出现 `sdkwork` 与 `birdcoder`。种子清单与漂移门位于 `catalog.ts`；协议风格或端点不同的中转照常按 profile 逐项覆盖。base bundle 的休眠注释与 `agent-default-model` 不变——sdkwork/birdcoder 配置前保持休眠，默认 agent 模型仍是 `deepseek-official`。

## 测试

`catalog.spec.ts` 钉住目录成员与种子盖印、休眠目录条目（`declared: false`）、经 mock 服务器的端到端流式请求、空 profile 解析与 displayName 回退、以及种子漂移门（`vi.resetModules` + `vi.doMock` pi-ai providers 模块，置于文件末尾）。`discovery.spec.ts` 钉住 harness 路由的端点询问（绝不走种子短路）与草稿 baseURL 缺失/清空时的随包端点回退。`models-settings.e2e.ts` 断言添加提供方下拉包含这两个选项，并刷新 `empty` golden 快照。
