# Agent Note：登录前的模型选择

Status: implemented

[English](2026-11-04-model-selection-sign-in-preview.md) | 中文

## 问题

未登录的 BirdCoder 工作区没有任何可选模型。`llm-pi-ai` 只在中转路由的凭据可以解析之后才对外提供它的种子目录，因此随包提供的 `birdcoder` 配置档不产生任何提供方分组，输入区的模型位只显示“请选择模型”，用户也没有任何入口去请求那个能让这些模型可用的账号。启动时未登录会显示欢迎窗口，但从运行中的工作区无法再打开它。

## 决定

适配器随包提供某个路由的目录、但该路由尚无凭据时，把它作为**登录预览**：列出其模型，点选时先请求产品登录，再提交选择。

- **适配器缝。** `LlmAdapter.documentedModels(provider)` 返回适配器随包目录为该路由记录的模型，与凭据无关；`LlmRuntime.documentedModels` 像 `listModels` 一样校验并分离返回值。`llm-pi-ai` 只为随包中转路由（`sdkwork`、`birdcoder`）覆盖它：pi-ai 已安装目录描述了许多部署从不提供的提供方，未登录时全部列出会淹没选择器。对于无法完成请求的路由，`listModels` 仍然返回空，使路由与 `modelAvailable` 保持诚实。
- **目录投影。** `buildModelCatalog` 只在 `listModels` 返回空时回退到 `documentedModels`，把该分组标记为 `requiresSignIn`，并将它排除在 `routableProviders` 之外：目录说明用户接下来可以选什么，但不声称 Host 已经能向那里派发请求。该分组携带与已配置路由相同的模型元数据（名称、推理强度）。
- **选择闸门。** `ui-model-selection` 以本地化的“需登录”标签列出预览分组；点选时调用已挂载的 `ctx.iam.requestSignIn()`，随后重新读取会话级目录直到 Host 不再标记该路由，最后才提交选择。用户取消登录时当前模型保持不变并给出提示。若登录界面改为保存提供方凭据而不是建立会话，同一段短暂等待同样覆盖。`/model` 弹窗与输入区模型位两个入口共用该闸门；未挂载 IAM 服务的组合仍由 Host 自身拒绝。
- **桌面端表面。** `ui-sdkwork-iam.requestSignIn()` 在桌面壳中改为在运行中的工作区之上打开欢迎登录页——即 `apps/desktop` 实现的 `window.dshDesktop.auth.openSignIn()`。该页回报结束手势：`login` 打开页面内 IAM 登录界面（密码、手机验证码、邮箱验证码、扫码），`credential` 报告 API Key 已写入，`dismissed`（或关闭页面）表示取消。工作区文档不会重新加载，因此待提交的选择可以跨越登录保留；原来的 `enterWorkspace` 路径仍是启动与退登录的行为。纯浏览器页面直接打开同一页面内界面。页面内表面同时也是其他所有登录的入口：欢迎窗口的一次性登录请求会打开它，而不是启动托管 OAuth 浏览器登录；它提交的双 Token 会话经桌面桥镜像到 `<DSH_HOME>/iam/session.json`，因此已恢复会话的用户完全跳过登录界面。

## 考虑过的替代方案

**通过 `listModels` 提供预览模型，另设可用性标记。** 放弃：`listModels` 同时是 Host 对 `selectModel` 与提示词准入的可用性检查，预览行会变成可以选中一条无法派发的路由，客户端还需要第二个就绪事实来补偿。

**在客户端硬编码中转种子。** 放弃：种子由 SDKWork 目录生成并已存在于 `llm-pi-ai`，客户端副本会随目录升版而漂移。

**在会话中途复用启动时的 `enterWorkspace` 路径。** 放弃：它会再次导航工作区，页面重新加载，待提交的模型选择、菜单状态与草稿都会丢失。

**桌面端只打开页面内 IAM Modal。** 放弃：本产品的登录页就是未登录启动时显示的欢迎窗口，需求明确要求该页面。

**把桌面端登录交给托管 OAuth 浏览器流程。** 放弃：该流程要求租户应用注册为带深链回调的 OAuth relying party，而当前部署的租户在授权端点返回 `invalid_client`（OAuth 客户端未注册或未启用），浏览器只会显示 API 错误而不是登录页。页面内 IAM 表面提供同样的账号登录方式，并在无需该注册的情况下提交同样的持久双 Token 会话。

## 后果

未登录的 BirdCoder 工作区现在会显示默认模型名、列出中转模型，并把一次点选变成登录请求；登录完成后无需刷新即可应用选择。登录是可选动作：关掉页面就保持原模型。模型页的就绪报告仍然诚实——凭据解析前该路由报告没有可用模型；用户自行保存的 Key 会完全消除预览状态，选择器行为与以前一致。

登录后闸门最多等待十五秒让 Host 重新发布目录，手势未产生会话时最多等待三秒；凭据经桌面端镜像的两秒对账与适配器的目录重载到达。纯浏览器登录不会为该中转写入凭据（那里没有可镜像的 Host 会话），因此点选会报告模型仍不可用并指向提供方凭据；欢迎页的 API Key 路径覆盖这种部署。

## 测试

`packages/llm/llm/tests/service.spec.ts` 覆盖 documented-models 缝（含缺省与分离）。`packages/llm/llm-pi-ai/tests/catalog.spec.ts` 证明中转路由在 `listModels` 仍为空时记录其种子，且已安装的非中转路由不记录任何模型。`packages/api/session-controller/tests/session-models.host.spec.ts` 固定 `requiresSignIn` 分组及其被排除在 `routableProviders` 之外。`packages/client/ui-model-selection/tests` 覆盖闸门辅助函数、输入区模型位的登录流程与取消，以及两个入口经 IAM 缝共享状态。`packages/client/ui-sdkwork-iam/tests/iam-deeplink-login-e2e.client.spec.ts` 用真实桌面桥与深链回调驱动欢迎页手势。`apps/desktop/tests/welcome-startup.spec.ts` 在运行中的工作区之上打开登录页，并证明文档没有被重新加载。
