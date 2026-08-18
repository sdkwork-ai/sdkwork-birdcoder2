# @deepseek-ai/dsh-sdkwork-env-bootstrap

[English](README.md) | 中文

harness 应用 bin 的 SDKWork 引导 env 胶水：解析启动环境声明的部署 profile（`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` / `SDKWORK_ENVIRONMENT`），并确保 bootstrap access token 存在，token 生成与 env 文件解析复用 `@sdkwork/iam-credential-entry`。未打包的 `pnpm desktop:dev` 套用 `.env.standalone.development`（网关 `https://api-dev.birdcoder.com`）；打包后的桌面构建套用 `https://api.birdcoder.com`。

按 sdkwork-specs `ENVIRONMENT_SPEC.md` §6.1：显式配置的 `SDKWORK_ACCESS_TOKEN` 与 IAM 应用引导注册产物（`.sdkwork.local.env`）优先；否则 development 生成一次性本地 JWT 写入被 gitignore 的 `.env.standalone.development.bootstrap.local` 覆盖文件，test 需要 `--allow-test-token-generation`，staging/production 对私有 secret 来源 fail closed。失败从不抛出：调用方继续以交互式 IAM 登录作为凭据兜底。

本模块刻意不复制任何 canonical SDKWork 逻辑：JWT 创建、manifest 身份查找、env 合并、bootstrap env 文件解析与序列化全部留在 `@sdkwork/iam-credential-entry`（动态加载，因此没有 SDKWork 兄弟 checkout 的 harness 仍可启动）。

## 用法

```sh
pnpm exec tsx packages/boot/sdkwork-env-bootstrap/src/bin.ts [--allow-test-token-generation]
```

或在分层 `.env` 加载之后从 launcher 调用 `ensureSdkworkBootstrapToken`；`apps/cli` 与 `apps/desktop` 在启动时执行。桌面壳还会先调用 `applySdkworkDesktopLaunchEnv`：未打包的 `desktop:dev` 向上走到仓库根目录，并从 `.env.standalone.development` 填入尚未设置的 identity/gateway 键；打包构建填入生产网关。

## Model Experience

无，因为本包只运行在 host 侧并写入被 gitignore 的覆盖文件，不触及模型请求。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求。

## 已知限制与后续工作

- **token 刷新是手动的**：覆盖文件中的 token 在文件删除（或覆盖文件被移除）之前一直复用，因此过期的 24 小时 fixture JWT 需要删除覆盖文件并重启。token 有效性归 canonical 包所有；本模块不解码 JWT。
- **浏览器运行时从不注册或生成**：token 生成只发生在 host launcher 中，符合 `IAM_APPLICATION_BOOTSTRAP_SPEC.md`。
