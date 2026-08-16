## 目标

在 sdkwork-birdcoder2(DeepSeek Harness fork,产品身份 `sdkwork-birdcoder`,调用 `https://api.sdkwork.com`)落实 sdkwork-specs `ENVIRONMENT_SPEC.md`(v1.2)的 env 文件配置标准。仓库现状:无任何 env 文件配置;加载机制为 `packages/boot/app-boot` 的 `loadLayeredEnv`(读调用目录 `.env` + `DSH_HOME/.env`,拒绝 `DSH_*` 前缀与网络类 bootstrap 变量);`.gitignore` 仅忽略 `.env`。

## 适用条款(已核对规范全文)

- §5.1 规范 profile id:`<deploymentProfile>.<environment>`(如 `standalone.development`),禁用 `.dev`/`.prod` 等别名文件名
- §5.1.1 四层模型:源权威(etc/)→ 物化 env(`.env`/`.env.<profile>.example`)→ 本地覆盖(忽略)→ 运行时覆盖(进程 env)
- §5.1.2 identity 键:物化文件必须自声明 `SDKWORK_ENVIRONMENT`/`SDKWORK_DEPLOYMENT_PROFILE`/`SDKWORK_PROFILE_ID`/`SDKWORK_RUNTIME_TARGET`(+ 应用级 `SDKWORK_BIRDCODER_*`)
- §5.1.7 忽略覆盖:`.env.local`、`.env.<profile-id>.local`、`.env.<profile-id>.bootstrap.local`;模板零真实凭据
- §6.1 `SDKWORK_ACCESS_TOKEN` 必须出现在 checked-in 模板(`.env.example`),且不得暴露给浏览器侧
- §4 命名规则:大写蛇形;每个键有归属与文档
- 不适用:§7.1 `.env.postgres.example`(本仓库无 PostgreSQL,仅有客户端 SQLite 会话存储,且不由 env 驱动);§5.1.4 Vite 格式(web 端 env 走 `ui-env` settings 而非 `VITE_*`);§5.1.3 的 `.env.<profile-id>.example` 具体文件(加载器只读固定 `.env`)

## 改动清单

### 1. 新增根目录 `.env.example`(模板)

- 头部注释:规范出处(ENVIRONMENT_SPEC §5.1)、用法(复制为根目录 `.env`,即默认 `standalone.development` profile 的物化)、禁止事项(不提交真实凭据;加载器拒绝的变量只能由启动环境导出)
- §5.1.2 identity 键(默认值 `standalone.development`,`RUNTIME_TARGET=server` 并注释 desktop/browser 可选值):通用 + `SDKWORK_BIRDCODER_*` 两组
- §6.1 `SDKWORK_ACCESS_TOKEN=` 空占位 + 注释(签名 JWT,非交互 app-api/backend-api 引导凭据,ui-env accessToken 语义;留空则走 IAM 会话)
- 产品 API 键(空占位,注释说明对应 provider 与不可提交):`DEEPSEEK_API_KEY`、`EXA_API_KEY`、`PERPLEXITY_API_KEY`、`E2B_API_KEY`、`SDKWORK_API_KEY`、`BIRDCODER_API_KEY`
- 启动环境专属变量:仅以注释列出(`# DEEPSEEK_BASE_URL=... # 只能由启动 shell 导出`),`DSH_HOME`/`DSH_WEB_PORT`/`DSH_TELEMETRY_DISABLED`/`DSH_*` 族、代理变量等——不出现可赋值的键行,避免用户复制后触发加载器拒绝

### 2. `.gitignore`(修改)

在 `.env` 之后追加(§5.1.7 忽略规则,注释注明出处):
```
.env.local
.env.*.local
.env.*.bootstrap.local
```
保留现有 `.env`;不采用兄弟仓库的 `.env.*` + `!.env.*.example`(会误忽略未来受跟踪的物化 profile 文件)。

### 3. 文档(修改)

- **AGENTS.md** "Secrets / .env" 段:补充——根目录 `.env` 是按 SDKWork env 标准的物化默认 profile(`standalone.development`,模板 `.env.example`,覆盖 `.env.*.local` 忽略),identity 键与 `SDKWORK_ACCESS_TOKEN` 约定见 ENVIRONMENT_SPEC §5.1/§6.1;加载器拒绝 `DSH_*`/网络类变量(须由启动环境导出)。保留 cordis.yml 与密钥策略原文
- **docs/development.md** §Environment variables:引用 `.env.example` 模板、复制步骤、identity 键、ambient-only 清单指针;**docs/development.zh.md** 同步
- **INSTALL.md + INSTALL.zh.md**:源码检出段加一句——可用根目录 `.env.example` 模板复制为 `.env`(保持 gitignored),与既有 "DEEPSEEK_BASE_URL 不进 .env" 说明衔接

### 4. Agent Note(新增,符合 AGENTS.md 非平凡改动要求)

`.agents/notes/implemented/process/2026-08-17-sdkwork-env-file-standard.{md,zh.md,i18n.yaml}` 三件套(class: process——仓库约定/策略)。内容:问题(无 env 文件配置、标准未落实)、决策(模板+忽略+文档映射到现有分层加载器)、否决项(profile 感知加载器改造 B——现有加载器已实现"项目层+用户层"覆盖语义、加载器只读固定 `.env`,profile 文件无消费者;etc/ 源权威层 C——本仓库无 standalone/cloud 部署矩阵机制、无消费者;`.env.postgres.example`——无 PostgreSQL)、后果、验证。遵循 implemented 骨架(Problem/Decision/Alternatives/Consequences/Testing)。

## 验证

- `pnpm run verify-agent-note-format`(或 doc-sync 内的对应 gate)验证新 note 格式
- `pnpm run verify-translation-pairing --write <note>` 及文档配对记录(若脚本可用)
- `git diff --check` 空白门禁;`git status` 确认无意外文件
- 无 TS 代码改动,不运行 typecheck/test 全量;不运行完整 doc-sync(改动面为模板+文档,针对性 gate 足够,CI 拥有全量)

## 明确不做

- 不改 `packages/boot/app-boot` 加载器代码、不加 `.env.<profile-id>` 读取
- 不加 `etc/sdkwork.deployment.config.json` / `etc/topology/`
- 不加 `.env.postgres.example`