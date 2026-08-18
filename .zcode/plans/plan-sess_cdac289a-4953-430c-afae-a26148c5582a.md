## 目标

按 sdkwork-specs 规范落实：真实（非 .example）的 dev/test/production env 物化文件 + 启动/build 时自动生成 bootstrap access token（含一键 app 注册）+ 所有 SDKWork 插件 SDK 初始化统一消费 env 中的 access token 与 base url，方便不同环境本地测试。

## 1. 真实的 env 物化文件（git 跟踪，占位符安全值）

- 新增 `.env.standalone.development` / `.env.standalone.test` / `.env.standalone.production`（跟踪提交）：
  - identity 键（含 `SDKWORK_BIRDCODER_*` 应用级，与现有模板一致）：`SDKWORK_ENVIRONMENT` / `SDKWORK_PROFILE_ID` 等
  - base URL 键：`SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL`（dev/test=`http://127.0.0.1:10240`，production 留注释）、`SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL`（test=`https://api-test.sdkwork.com`，production=`https://api.sdkwork.com`，dev 留空走 ui-env 默认）
  - `SDKWORK_ACCESS_TOKEN=` 空占位（真实 token 由启动流程写进 gitignored 的 `.env.standalone.<env>.bootstrap.local`）
  - provider 键占位（DEEPSEEK_API_KEY 等）
- 删除上一轮创建的 `.env.standalone.test.example` / `.env.standalone.production.example`（被真实文件取代）；保留 `.env.example` 作为通用模板并更新头部（指向三份真实文件与 overlay 用法）
- `.gitignore` 无需改（materialized 文件不被忽略；`.env.*.bootstrap.local` 已忽略）

## 2. sdkwork.app.config.json（新文件）

- 根目录新增，照原版 sdkwork-birdcoder 的产品配置（schemaVersion 3；`app.key=sdkwork-birdcoder`、`backend.appId=sdkwork-birdcoder`、`tenantId=100001`、`organizationId=0`、`accessTokenPermissionScope` 等）——注册与 token 生成的 manifest 来源

## 3. workspace 依赖（复用官方包，规范强制，禁止自造）

- `pnpm-workspace.yaml` 增加两个兄弟包（均位于 `../sdkwork-iam/apps/sdkwork-iam-common/packages/`）：
  - `sdkwork-iam-credential-entry`（`@sdkwork/iam-credential-entry`，token 生成/读取的 canonical 实现）
  - `sdkwork-iam-application-bootstrap`（`@sdkwork/iam-application-bootstrap`，register→provision→enable→access-credential 编排）
- 校验 `scripts/sdkwork-dependencies.ts`（pin manifest 按仓库粒度，预计无需改动，跑校验确认）

## 4. 启动/build 自动 ensure bootstrap token（分层自动）

- 新模块 `scripts/sdkwork-env-bootstrap.ts`（可独立运行 `pnpm env:token:ensure`，也被启动入口 import）：
  - 仅当环境含 `SDKWORK_*` 配置时激活（纯 harness 用户零影响）
  - 优先级：已有 token（process env / `.sdkwork.local.env` 注册结果）→ 不动；否则 development 自动生成 fixture JWT（复用 `@sdkwork/iam-credential-entry/node-bootstrap` 的 `buildBootstrapAccessTokenEnvRecord`，claims 带 app_id/tenant_id/environment 等，token_version=1）写 `.env.standalone.development.bootstrap.local`；test 需显式开关（CLI 标志 `--allow-test-token-generation`，键名实现时以 sdkwork-iam 现成为准）写 `.env.standalone.test.bootstrap.local`，否则 warn 由 IAM 交互登录兜底；production 只读 secret 不生成，缺失时 warn
  - 幂等：token 已存在不覆盖
- 启动集成：`apps/cli/src/bin.ts`（profile 分支，loadLayeredEnv 后）与 `apps/desktop/src/host.ts`（bootDesktopHost 内）调用 ensure；web 走 `pnpm dsh web` 自动覆盖；build 不做 token 注入（规范：browser 构建不嵌入 token）

## 5. 一键 app 注册（显式管理命令）

- 新脚本 `scripts/sdkwork-app-bootstrap.ts` + 根 scripts `admin:bootstrap:app`：复用 `@sdkwork/iam-application-bootstrap` 的 `bootstrapApplicationFromManifest`（读 `sdkwork.app.config.json`），super-admin 凭据来自 `~/.sdkwork/users/super-admin.json` 或 env（`SDKWORK_BACKEND_BASE_URL` / `SDKWORK_IAM_SUPER_ADMIN_USERNAME/PASSWORD`），输出 `.sdkwork.local.env`（SDKWORK_APP_ID/SDKWORK_ACCESS_TOKEN 等）——ensure 流程自动优先使用该真实 token

## 6. env → ui-env 投影（核心：7 个 SDKWork 插件零改动自动生效）

- `packages/client/ui-env/src/index.ts`（host 半区，node 侧）在注册 settings 时投影：
  - 档位推断：`SDKWORK_PROFILE_ID`/`SDKWORK_ENVIRONMENT` → development/testing/production
  - baseUrl：`SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` → `SDKWORK_BIRDCODER_APP_API_BASE_URL` → `SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL` 取首个非空
  - accessToken：process env/.env 的 `SDKWORK_ACCESS_TOKEN` → 否则读 `.env.standalone.<env>.bootstrap.local`（复用 `readBootstrapAccessTokenEnvFile`）
  - 投影语义：`accessToken` 每次启动以 env 为准（token 权威）；`apiBaseUrl`/`appId`/`appKey` 仅在 settings 为空时填充；`environment` 仅在 settings 未显式配置时由 env 推断（挂点实现时以 `@deepseek-ai/dsh-settings` API 为准，候选：启动时写入 settings 文档、幂等）
  - 浏览器侧 7 个插件（ui-appstore / ui-feedback / ui-iam / ui-generations-image / ui-generations-video / ui-knowledge / ui-token-plan）已统一读 `env.apiBaseUrl()` 与 `env.accessToken()`（syncTokens 语义）——投影打通后**无需改动**

## 7. 文档与笔记

- `docs/development.md`/`INSTALL.md`（含 zh）：真实文件 + 自动 token + 注册命令 + 投影语义；`packages/client/ui-env/README.md`（含 zh）：投影语义；`.env.example` 头部
- 新 Agent Note（process 类，md/zh/i18n.yaml 三件套）记录本次决策；配对记录用 `verify-translation-pairing --write` 重录
- AGENTS.md 不动（存量超预算 1976/1950，另行处理）

## 8. 测试与门禁

- ui-env host 投影 unit test（mock launch env + settings，覆盖：空字段填充、token 覆盖、bootstrap.local 读取、environment 推断）；ensure 脚本测试（临时目录、幂等、优先级）
- `pnpm install` 后跑：`verify-translation-pairing`、`verify-md-links`、`verify-agent-note-format`、`verify-doc-budgets`（除 AGENTS 存量项）、ui-env/cli/desktop 相关 unit test 与 typecheck、`sdkwork-dependencies` 校验、`git diff --check`

## 风险与注意

- `@sdkwork/iam-credential-entry` 与 `@sdkwork/iam-application-bootstrap` 是私包（private: true），投影逻辑只进 host（node）半区，确认 ui-env tsdown client bundle 不打包 node 侧 import
- 浏览器运行时禁止直接调注册 API、禁止在 bundle 中嵌入 token（规范红线，本方案均不触犯）；应用代码不复制 JWT 生成/注册编排逻辑（全部复用官方包）