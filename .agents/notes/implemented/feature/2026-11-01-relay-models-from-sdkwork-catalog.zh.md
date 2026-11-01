# Agent Note：中转模型来自 SDKWork 模型目录

Status: implemented

[English](2026-11-01-relay-models-from-sdkwork-catalog.md) | 中文

## 问题

本发行版随包提供的两条中转路由（`sdkwork`、`birdcoder`）原先以一份手工维护的十五个主流 id 作种子，这些 id 借用自已安装的 OpenRouter 目录。这份清单随构建版本变旧，而不是随市场更新：在各厂商早已发布后继模型之后，选择器仍在提供 GPT-4o、GPT-4.1 与 Claude 4.5，并且在目录把 `deepseek/deepseek-v4-flash` 标记退役之后仍以它作默认。种子与"各厂商实际提供什么"的记录之间没有任何联系，因此刷新选择器成了没人排期的代码改动。

## 决策

`packages/llm/llm-pi-ai/src/relay-models.generated.ts` 是同级 `sdkwork-models` 目录的投影，由 `scripts/generate-sdkwork-relay-models.mjs` 生成。它携带目录判定为现行（`shelfState: listed`、`routingState: enabled`，且 `lifecycle` 与 `releaseStage` 均为 `active` 或 `preview`）的全部对话模型，再去掉替换链中后继同样在售的旧成员——在目录 `2026.11.01.1` 下为 86 行——以及目录声明的 id、显示名、厂商、上下文窗口、输出上限与输入模态。

顺序采用目录自身的主流顺序（厂商 `sortOrder`，其次 lifecycle，再次 `rankScore`），唯一例外是把 DeepSeek 区块提到最前。DeepSeek 置顶是 BirdCoder 的产品决定而非目录事实，因此它是投影所做的唯一重排；其他厂商保持 SDKWork 模型应用所显示的顺序。

两条去弃用规则共同决定集合。厂商的首选区域决定模型状态：该厂商有全球区域时以其全球行为准，否则由它实际发布的区域决定，因此全球目录已弃用的模型不会进入种子，即使某区域目录仍将其列为 active（本目录版本下有两条 ByteDance 记录如此）；而只存在于区域目录的模型则沿用该区域的行。`replacementModel` 经替换链（带环检测）指向另一个在售行的记录会被去掉：选择器展示每条替换链的头部（Claude Opus 4.5–5 与 Sonnet 5 让位于 Opus 5.5 与 Sonnet 5.5，Fable 5 让位于 Fable 5.1，Gemini 3.1 Flash Live Preview 让位于 Gemini 3.8 Live），而不是每个旧成员。若声明的后继并不在售，该行会保留，因此不会有模型在没有可见替代的情况下消失。生成器拒绝会重复目录键、把同一厂商拆成多段、把模型与其声明的后继同时展示、或以 DeepSeek 之外厂商开头的投影。

`relay.ts` 把每一行物化为 pi-ai 模型。当已安装的 OpenRouter 目录描述同一模型时——无论按目录键、厂商别名（`xai`→`x-ai`、`zhipu`→`z-ai`、`moonshot`→`moonshotai`、`alibaba`→`qwen`），还是 OpenRouter 的点号版本写法（`claude-opus-4-5`→`claude-opus-4.5`）——种子会借用该条目的线上事实，并且只在中转使用同一协议时保留其 `compat` 块。pi-ai 未描述的目录行仍然可用作种子：它能列示与路由，但没有推理分发与兼容开关。

种子依旧只是投影，不是端点本身。"模型"页的"获取模型"仍会询问中转站，profile 的 `models` 或 `modelOverrides` 也仍会替换种子所提供的内容。

web-app bundle 的默认模型改为 `deepseek/deepseek-v4-pro`，即种子置顶的 DeepSeek 条目。已退役的 `deepseek/deepseek-v4-flash` 在目录中不再存在，继续保留它等于随包发布一个选择器无法显示的默认模型。

## 备选方案

**运行时调用模型应用 API。** 模型服务以匿名方式提供 `GET /app/v3/api/ai/models`，Host 可以通过 `@sdkwork/models-app-sdk` 调用。否决原因：该清单携带 id、名称、模态与容量，但不携带顺序或新旧信号——同一厂商内是字母序——因此"最新在前"与 DeepSeek 置顶只能由 Host 依据服务并未发送的数据重新计算。它还会让每次打开选择器都依赖一次网络调用，而离线桌面启动必须能挺过这次调用；当前中转目录是 Host 侧的静态事实。目录投影携带的正是 SDKWork 模型应用自身排序所用的策展顺序；只有当服务开始发布该顺序时，运行时刷新才值得它的成本。

**保留手工种子、只补充最新 id。** 否决原因：它重复同样的腐烂过程。下一次厂商发布就会让问题重现，而且没有任何记录说明这份清单写于哪个目录版本。

**只为已安装 OpenRouter 目录描述的模型提供种子。** 否决原因：它会恰好丢掉最新的行——DeepSeek V4.1 Flash、Claude Mythos、若干 OpenAI cyber 模型——因为 pi-ai 的目录落后于 SDKWork 目录。而这些正是本次改动的目的所在。

**每个厂商只生成一行旗舰模型。** 否决原因：厂商同时提供多条线（旗舰、快速、cyber、多语），用户会在它们之间选择。每厂商一行比目录所描述的更窄。

## 后果

- 选择器提供目录中当前全部对话模型，而不是十五个精选 id。清单长且厂商密集；提供方分组与名称搜索是让它可浏览的手段。
- pi-ai 未描述的种子模型没有推理档位：`reasoning` 为 false 且不携带 `compat` 块，因此 harness 对该模型发送中转站的默认参数。
- 目录升版后重新生成是常规 fork 工作（`node scripts/generate-sdkwork-relay-models.mjs`）；`--check` 会在内存中重新投影目录，并在已提交的种子过期时以非零退出，评审因此可以证明对齐，而不必逐行阅读 diff。
- 部署并不提供的种子 id 仍会出现在选择器中；选择它会在请求时像任何不可用模型一样失败，"获取模型"才是查看端点实际集合的方式。
- 在未随包提供默认模型的组合里，birdcoder-account 优先选择 `deepseek` id 的回退逻辑现在会选中 `deepseek/deepseek-v4-pro`。

## 测试

`packages/llm/llm-pi-ai/tests/catalog.spec.ts` 钉住种子的成员与顺序（DeepSeek 区块置顶；当前旗舰在列；退役、弃用、隐藏、区域弃用以及已被替换的 id 缺席）、每个目录键仅一行、厂商区块连续、每个解析出的模型都有正容量与 `厂商: 模型` 名称、默认 Anthropic 面与随包 `openai-completions` 面上的解析顺序完全一致、pi-ai 未描述的目录行仍可作种子，以及在已安装 pi-ai 目录被 mock 为空时仅凭目录行即可解析的种子。`packages/bundle/web-app/tests/birdcoder-default.spec.ts` 钉住随包默认模型并解析到中转路由，`apps/web/tests/shipped-composition.e2e.ts` 钉住组装后的 Web 默认值。聚焦运行：

```sh
pnpm exec vitest run packages/llm/llm-pi-ai/tests packages/client/ui-model-selection/tests packages/bundle/web-app/tests packages/credentials/birdcoder-account/tests
```
