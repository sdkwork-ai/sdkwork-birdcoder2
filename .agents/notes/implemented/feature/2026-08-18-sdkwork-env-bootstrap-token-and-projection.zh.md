# Agent Note: SDKWork env 引导 token 生成与 ui-env 投影

Status: implemented

[English](2026-08-18-sdkwork-env-bootstrap-token-and-projection.md) | 中文

## Problem

env 文件标准（[2026-08-17-sdkwork-env-file-standard.md](../process/2026-08-17-sdkwork-env-file-standard.md)）只物化了模板，`SDKWORK_ACCESS_TOKEN` 没有任何代码消费：所有 SDKWork 集成插件都从 settings 驱动的 `ui-env` profile 初始化 SDK，而该 profile 的 `accessToken` 字段没有写入方，测试其他环境意味着手工编辑 `$DSH_HOME/settings.yaml` 并手工配置 token。产品需要受跟踪的物化 env 文件、启动时自动提供 bootstrap token（按 sdkwork-specs `ENVIRONMENT_SPEC.md` §6.1），以及一条统一的 env → SDK 通路，让全部七个 SDKWork 插件都从 env 文件初始化。

## Decision

- **受跟踪的物化 env 文件**：仓库根目录的 `.env.standalone.development`、`.env.standalone.test` 与 `.env.standalone.production` 只携带 identity 键、surface URL 与占位凭据（§5.1）；`.env.example` 保留为通用模板，之前的 `.env.standalone.*.example` 文件删除。`sdkwork.app.config.json`（schemaVersion 3，`backend.appId=sdkwork-birdcoder`）是注册与 token 生成的 manifest。
- **启动 token ensure**（`@deepseek-ai/dsh-sdkwork-env-bootstrap`，新 `packages/boot` 包）：`dsh` CLI 与桌面壳在 `applySdkworkLaunchEnv` 之后、分层 `.env` 快照之前调用 `ensureSdkworkBootstrapToken`。优先级：显式配置的 `SDKWORK_ACCESS_TOKEN` → 注册产物 `.sdkwork.local.env` → 已有 overlay → 生成——development 自动生成一次性本地 JWT 并写入被 gitignore 的 `.env.standalone.development.bootstrap.local` 覆盖文件，test 需要 `--allow-test-token-generation`，staging/production 对私有 secret 来源 fail closed。overlay 与注册产物用 `node:util.parseEnv` 解析，因此可选的 `@sdkwork/iam-credential-entry` import 无法解析时 Electron 仍能投影 token。`applySdkworkLaunchEnv` 会用非空 overlay token 覆盖空白的 `SDKWORK_ACCESS_TOKEN=` 占位。确保到的 token 会被物化进 `process.env` 供 ui-env host 投影使用。JWT 创建与 manifest 查找留在 `@sdkwork/iam-credential-entry`（动态加载，因此没有 SDKWork 兄弟仓库的 harness 仍可启动）。`pnpm env:token:ensure` 会先套用 launch profile；`pnpm build`、`pnpm desktop:dev` 与 `pnpm desktop:dist` 都会运行它，因此 overlay 在 Electron 启动前已存在。未打包的 `pnpm desktop:dev` 传入 `development`，即使 Electron 的 cwd 是 `apps/desktop` 也会投影 development 网关；打包构建套用生产网关（[desktop:dev 与打包网关](../bug-fix/2026-08-18-desktop-dev-development-gateway.md)）。
- **一键注册**（`pnpm run admin:bootstrap:app`，`scripts/sdkwork-app-bootstrap.ts`）：通过 `@sdkwork/iam-application-bootstrap` 完成 register → provision → enable → access credential，以超管 profile 认证（`~/.sdkwork/users/super-admin.json` 或 `SDKWORK_IAM_SUPER_ADMIN_*` env），写出 `.sdkwork.local.env`；ensure 步骤随后优先使用签发的真实 token。
- **ui-env 投影**（`packages/client/ui-env`）：host 注册把启动环境投影作为 settings 注册的组合 `base` 层传入——声明的环境档位（`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT`，`test` → `testing`）、首个非空的 surface URL（`SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` → `_APP_API_BASE_URL` → `_APPLICATION_PUBLIC_HTTP_URL`）与 `SDKWORK_ACCESS_TOKEN`。settings 解析顺序（schema 默认 → base → 用户文档）保证用户编辑过的 `ui-env:` 分区仍然权威。七个 SDKWork 插件无需改动：它们本来就读取 `env.apiBaseUrl()` 与 `env.accessToken()`。
- **workspace 接线**：`@sdkwork/iam-credential-entry` 与 `@sdkwork/iam-application-bootstrap` 加入 `pnpm-workspace.yaml`（仅依赖解析成员，与兄弟包一致）；消费方以 devDependencies/optionalDependencies（`workspace:^` + 发布版兜底）声明，与 ui-iam 处理私有 SDKWork 包的既有模式一致。

## Alternatives considered

**浏览器侧直接读 `process.env`。** 渲染 bundle 看不到 host 环境；把 token 注入 HTML（`@sdkwork/iam-credential-entry/vite` 风格）仅限 serve 且构建禁止——规范的 canonical Vite owner 服务于 Vite 根，而本产品的 web 壳由 host 组装（`window.__DSH_BOOT__`），settings `base` 投影是所有表面共享的唯一通道。

**每次启动把投影写进 settings 文档。** 写入 `$DSH_HOME/settings.yaml` 会持久化生成的 token（24 小时轮换的 fixture JWT）、污染用户可编辑文件并与并发写入竞争；组合 `base` 层在内存中、幂等且每次启动可刷新。

**启动时总是调用注册 API。** 注册是 bootstrap-body 超管管理动作（`IAM_APPLICATION_BOOTSTRAP_SPEC.md`）：需要超管凭据、浏览器运行时禁止执行，cloudrouter 也从不从 dev/build 调用——分层做法（注册为显式命令、启动时 ensure token）才是符合规范的行为，未注册的开发环境用 fixture JWT 兜底。

## Consequences

- 本地测试的环境切换现在是 `cp .env.standalone.test .env` 加重启：`pnpm env:token:ensure`（以及 CLI/desktop 的 ensure 步骤）生成 token，ui-env 把环境、base URL 与 token 投影进每个 SDKWork 插件。
- 发布包优雅降级：`@sdkwork/*` 是可选依赖，动态 import 失败时落到 `unavailable`，harness 回退到交互式 IAM 登录。
- 代价：test 档需要显式 `--allow-test-token-generation` 开关；覆盖文件中的 token 在删除前一直复用（无 JWT 过期刷新——token 有效性归 canonical 包所有）；`admin:bootstrap:app` 需要超管凭据与可达的后端（`SDKWORK_BACKEND_BASE_URL`）。

## Testing

包级单元测试覆盖 ensure 阶梯（unconfigured / configured / registered / 无需 import 的 overlay / generated 幂等 / test 授权 / production fail-closed / manifest 缺失）、`applySdkworkLaunchEnv` 复制 overlay，以及桌面启动 env（子目录上溯、development 文件、packaged production、继承 URL）于 `packages/boot/sdkwork-env-bootstrap/tests`，投影（档位映射、URL 优先级、空字段省略、user 层权威）于 `packages/client/ui-env/tests`。CLI 已端到端实测：`pnpm env:token:ensure` 先套用 development profile 再写入或复用带 manifest claims 的覆盖 JWT，test 无开关时给出授权提示，`admin:bootstrap:app` 无超管凭据时 fail loud。文档门禁（翻译配对、预算、链接、note 格式）校验双语文档。
