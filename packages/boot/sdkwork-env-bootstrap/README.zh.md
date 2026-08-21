# @deepseek-ai/dsh-sdkwork-env-bootstrap

[English](README.md) | 中文

harness 应用 bin 的 SDKWork 引导 env 胶水：解析启动环境声明的部署 profile（`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` / `SDKWORK_ENVIRONMENT`），并确保 bootstrap access token 存在，token 生成与 env 文件解析复用 `@sdkwork/iam-credential-entry`。源码 checkout（`pnpm dsh web`、`pnpm desktop:dev` 以及 `apps/web` 下的 Vite 构建）会先尊重仓库根目录 `.env`，若缺失再回退到选中生命周期环境的 `.env.standalone.<environment>` 物化文件；打包、npx 与容器启动仍回退到 `https://api.birdcoder.com`。

按 sdkwork-specs `ENVIRONMENT_SPEC.md` §6.1：显式配置的 `SDKWORK_ACCESS_TOKEN`、IAM 应用引导注册产物（`.sdkwork.local.env`）以及已有的 overlay token 优先，且不必加载 `@sdkwork/iam-credential-entry`。development 与显式允许的 test 仅在活动 SDKWork 网关是 loopback（`localhost` / `127.0.0.1` / `::1`）时才会生成一次性本地 JWT，并写入被 gitignore 的 `.env.standalone.<environment>.bootstrap.local` 覆盖文件；远端网关必须使用真实、已 provision 的 token。staging/production 始终对私有 secret 来源 fail closed。失败从不抛出：调用方继续以交互式 IAM 登录作为凭据兜底。

本模块刻意不复制任何 canonical SDKWork 逻辑：JWT 创建、manifest 身份查找、env 合并、bootstrap env 文件解析与序列化全部留在 `@sdkwork/iam-credential-entry`（动态加载，因此没有 SDKWork 兄弟 checkout 的 harness 仍可启动）。已有 overlay 用 `node:util.parseEnv` 解析，因此当该动态 import 无法解析时，`pnpm desktop:dev` 仍能把 token 投影出去。

## 用法

```sh
pnpm env:token:ensure [--allow-test-token-generation]
```

`pnpm build`、`pnpm desktop:dev` 与 `pnpm desktop:dist` 都会运行此 CLI。它先调用 `applySdkworkLaunchEnv`（源码/开发 identity、网关与 overlay），再调用 `ensureSdkworkBootstrapToken`，在允许生成时写入被 gitignore 的覆盖文件。`apps/cli` 与 `apps/desktop` 在进程启动时、`loadLayeredEnv` 冻结 ui-sdkwork-env 所投影的启动快照之前，重复同一对调用。CLI 通过 `resolveSdkworkLaunchProfile` 自动选择 launch profile（存在 `sdkwork.app.config.json` 时为 development，否则为 production）。在源码 checkout 里，launcher 会先向上走到仓库根目录，优先套用已复制到根目录的 `.env`，再用选中生命周期环境匹配的 `.env.standalone.<environment>` 填补缺失的 SDKWork identity/gateway 键，最后把对应的 `.env.standalone.<environment>.bootstrap.local` token overlay 投影进冻结的启动快照。这样 `standalone.test` 与 `standalone.staging` 会在 `web`、`desktop` 与直接 Vite 构建之间保持一致。

## Model Experience

无，因为本包只运行在 host 侧并写入被 gitignore 的覆盖文件，不触及模型请求。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **token 刷新是手动的**：覆盖文件中的 token 在文件删除（或覆盖文件被移除）之前一直复用，因此过期的 24 小时 fixture JWT 需要删除覆盖文件并重启。token 有效性归 canonical 包所有；本模块不解码 JWT。
- **浏览器运行时从不注册或生成**：token 生成只发生在 host launcher 中，符合 `IAM_APPLICATION_BOOTSTRAP_SPEC.md`。
