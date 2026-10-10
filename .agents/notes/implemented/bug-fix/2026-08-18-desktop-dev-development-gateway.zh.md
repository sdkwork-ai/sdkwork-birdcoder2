# Agent Note: 未打包的 desktop:dev 使用 development API 网关

Status: implemented

[English](2026-08-18-desktop-dev-development-gateway.md) | 中文

## Problem

`pnpm desktop:dev` 启动 Electron 时 cwd 为 `apps/desktop`。`loadLayeredEnv` 只读取该目录的 `.env`（不上溯父目录），因此仓库根目录的 `.env.standalone.development` 从未加载。ui-sdkwork-env 于是保持 schema 默认 `environment: production` 与 origin `https://api.birdcoder.com`。打包的 `desktop:dist` 构建应继续使用该生产 origin；源码 `desktop:dev` 应使用 `https://api-dev.birdcoder.com`。

## Decision

Desktop Host 采用与 `dsh` CLI 相同的启动环境。`applyDesktopLaunchEnvironment`（`@deepseek-ai/dsh-desktop-host/launch-environment`）以 `resolveSdkworkLaunchProfile(process.cwd())` 调用 `applySdkworkLaunchEnv`，早于 `loadLayeredEnv` 冻结 ui-sdkwork-env 宿主投影给浏览器的启动快照：

- **development**（未打包的 `desktop:dev`）：从 profile 目录上溯到仓库根目录（`sdkwork.app.config.json`），套用 `.env.standalone.development` 中的非空键，再用 `https://api-dev.birdcoder.com` 补齐剩余 identity/gateway 键。空占位会被跳过，以便后续项目 `.env` 仍能提供密钥。
- **production**（打包/dist）：不上溯；仅为尚未设置的名称套用 `https://api.birdcoder.com` 与生产 identity 键。

**继承来的部署不等于覆盖。** 打包应用会把自己解析出的部署写进 `process.env`，它派生的每个进程——包括开发者的 shell，以及由此启动的 `pnpm desktop:dev`——都会继承。两条规则阻止这次泄漏决定源码运行的档位：

- `desktop:dev` 启动器为 Electron 子进程显式声明 development identity（`apps/desktop/scripts/development-sdkwork-env.ts`）：继承到的 production 部署会被替换为规范的 `standalone.development` identity 键，并丢弃继承的 gateway、base URL 与 access token，让子进程重新解析自己的档位。继承到 `test`/`staging`/`demo` 档位，或设置 `DSH_DESKTOP_DEV_KEEP_SDKWORK_ENV=1` 时保持不变。
- 不重新声明档位的启动会忽略其他应用注入的值：Desktop Host 会为自己解析出的 SDKWork 值打上标记（`markInjectedSdkworkEnv`），`applySdkworkLaunchEnv` 丢弃仍然与标记一致的键（`clearInheritedInjectedSdkworkEnv`）。操作者事后改过的值与标记不同，因此仍然优先。

测试省略启动器覆盖，因此隔离的 `cwd` 按原样使用。ui-sdkwork-env 仍通过 settings `base` 层投影；`$DSH_HOME/settings.yaml` 中用户编辑过的 `ui-sdkwork-env:` 分区仍然权威（[env 引导与投影](../feature/2026-08-18-sdkwork-env-bootstrap-token-and-projection.zh.md)）。

## Alternatives considered

**把 ui-sdkwork-env schema 默认改成 `development`。** 打包安装没有 env 文件，会打到 `api-dev.birdcoder.com`。

**让 `loadLayeredEnv` 上溯父目录。** 加载器的启动范围发现是既有约定（[env 文件标准](../process/2026-08-17-sdkwork-env-file-standard.zh.md)）；父目录搜索会让从嵌套工作区运行的 CLI 感到意外。

**要求在 `desktop:dev` 之前执行 `cp .env.standalone.development .env`。** 那是 CLI 工作流；`pnpm --filter` 会把 cwd 改成 `apps/desktop`，复制后仍然加载不到。

**在源码 checkout 中一律替换继承的 SDKWork 值。** 开发者会有意把源码运行指向本地网关（`http://127.0.0.1:10240`）或 test/staging，仅凭值无法与泄漏的 production 部署区分；只有声明的档位与溯源标记能区分两者。

## Consequences

`pnpm desktop:dev` 无需仓库根目录 `.env` 就会投影 `https://api-dev.birdcoder.com`，即使启动它的 shell 带着其他应用的 production 环境。打包构建保持 `https://api.birdcoder.com`。若用户先前在设置文档中保存了 `ui-sdkwork-env.environment: production`，在清除该分区或改为 `development` 之前仍会看到生产环境。启动 shell 中显式设置的 `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` 仍然优先。

## Testing

`packages/boot/sdkwork-env-bootstrap/tests` 中的包级单元测试钉住子目录上溯、受跟踪的 development 文件（跳过空占位）、打包 production origin（不上溯）、继承 URL 的保留，以及注入值的标记与丢弃。`apps/desktop/tests/development-sdkwork-env.spec.ts` 钉住启动器对继承 production 部署的替换、对 test/staging 与 `DSH_DESKTOP_DEV_KEEP_SDKWORK_ENV=1` 的保留。文档门禁（翻译配对、链接、note 格式）校验双语文档。
