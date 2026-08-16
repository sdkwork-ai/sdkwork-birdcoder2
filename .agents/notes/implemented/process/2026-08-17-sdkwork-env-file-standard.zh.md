# Agent Note: SDKWork env-file standard materializes the root .env

Status: implemented

[English](2026-08-17-sdkwork-env-file-standard.md) | 中文

## Problem

仓库完全没有 env 文件配置：引导加载器读取调用目录与 Harness home 中一个被 gitignore 的 `.env`（[`loadLayeredEnv`](../../../../packages/boot/app-boot/src/index.ts)），文档告诉贡献者把密钥放进该文件，但仓库既没有已检入的模板，也没有覆盖文件的忽略规则，更没有身份声明。sdkwork-specs 的 `ENVIRONMENT_SPEC.md` 定义了规范的 env 文件标准——两段式 profile id（`<deploymentProfile>.<environment>`）、自我声明的 identity 键、只含占位符的受跟踪模板、被 gitignore 的本地覆盖文件——而本仓库作为 SDKWork 产品根目录并未遵循该标准。

## Decision

仓库现在按该标准物化默认开发 profile，由现有加载器继续作为固定 `.env` 的消费方：

- **仓库根目录 `.env.example`** 是规范 profile `standalone.development` 的已检入模板：通用与 `SDKWORK_BIRDCODER_*` 两套 identity 键（`SDKWORK_ENVIRONMENT`、`SDKWORK_DEPLOYMENT_PROFILE`、`SDKWORK_PROFILE_ID`、`SDKWORK_RUNTIME_TARGET` 及应用级对应项）、`SDKWORK_ACCESS_TOKEN` 引导凭据占位（ENVIRONMENT_SPEC §6.1）、产品 provider 密钥（`DEEPSEEK_API_KEY`、`EXA_API_KEY`、`PERPLEXITY_API_KEY`、`E2B_API_KEY`、`SDKWORK_API_KEY`、`BIRDCODER_API_KEY`），以及以注释形式列出的、加载器拒绝写入 `.env` 文件的启动环境变量清单。
- **`.gitignore`** 在现有 `.env` 之外，忽略标准规定的覆盖文件（`.env.local`、`.env.*.local`、`.env.*.bootstrap.local`）。
- **文档**（AGENTS.md、docs/development.md、INSTALL.md 及其中文对应文件）指明模板、profile id 约定与加载器的 bootstrap 名称拒绝规则。AGENTS.md 的字数预算上限从 1900 提高到 1950（[scripts/doc-budgets.manifest.json](../../../../scripts/doc-budgets.manifest.json)）：该文件原本恰好位于上限，而 env 文件约定必须保留在贡献者契约中可见（AGENTS.md 自身的编辑规则允许在必需内容确实需要更多空间时提高上限）。

identity 键目前仅作自我声明：运行时还没有任何代码读取它们，这符合标准中"物化文件在成为权威之前必须先声明自身 profile"的规则。Web 渲染端的 SDKWork 端点仍来自 settings 驱动的 `ui-env` profile（[共享部署环境](../feature/2026-08-17-shared-deployment-environments.md)），而非 env 文件。

## Alternatives considered

**按 profile 感知的 env 加载（`loadEnv` 读取 `.env.<profile-id>`）。** 加载器可按 profile 选择 `.env.cloud.production` 等文件；但现有加载器已实现标准的分层模型（项目 `.env` + Harness home `.env`，继承的环境变量优先），没有任何消费者读取带 profile 后缀的文件，且仓库现有的 `--profile` 标志选择的是 cordis 组合而非部署环境——该改动只会增加没有消费者的机制。

**`etc/sdkwork.deployment.config.json` 与 `etc/topology/*.env` 源权威层。** 兄弟仓库在那里声明 standalone/cloud profile 矩阵；本仓库没有部署 profile 矩阵机制或消费者，声明将是空置的，还可能声称支持仓库实际不兑现的组合。

**`.env.postgres.example`。** 标准要求使用统一工作区 PostgreSQL profile 的仓库提供该文件；本仓库没有 PostgreSQL（会话持久化是客户端本地 SQLite，且不由 env 驱动），该文件只是噪音。

## Consequences

贡献者与运维现在有了一个已检入的模板，以占位符形式记录产品读取的全部 env 变量；标准规定的覆盖忽略规则也已就位，等 profile 后缀加载机制到来时即可使用。代价：identity 键目前处于空置状态，直到未来的部署环境消费者接入它们；模板把加载器的 ambient-only 名称以注释而非可赋值行呈现，因此简单复制不会触发加载器拒绝。

## Testing

note 格式与翻译配对 gate 校验本 note 三件套；`git diff --check` 保证空白整洁。没有代码改动，因此不涉及单元或快照覆盖；完整校验由 CI 的文档 gate 负责。
