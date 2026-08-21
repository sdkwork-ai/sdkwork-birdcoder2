# Agent Note: 未打包的 desktop:dev 使用 development API 网关

Status: implemented

[English](2026-08-18-desktop-dev-development-gateway.md) | 中文

## Problem

`pnpm desktop:dev` 启动 Electron 时 cwd 为 `apps/desktop`。`loadLayeredEnv` 只读取该目录的 `.env`（不上溯父目录），因此仓库根目录的 `.env.standalone.development` 从未加载。ui-env 于是保持 schema 默认 `environment: production` 与 origin `https://api.birdcoder.com`。打包的 `desktop:dist` 构建应继续使用该生产 origin；源码 `desktop:dev` 应使用 `https://api-dev.birdcoder.com`。

## Decision

Electron main 把 `sdkworkEnv: app.isPackaged ? 'production' : 'development'` 传入 `bootDesktopHost`。`applySdkworkDesktopLaunchEnv`（`@deepseek-ai/dsh-sdkwork-env-bootstrap`）在分层 `.env` 加载之前填入尚未设置的 SDKWork identity 与 gateway 键：

- **development**（未打包的 `desktop:dev`）：从 `apps/desktop` 上溯到仓库根目录（`sdkwork.app.config.json`），套用 `.env.standalone.development` 中的非空键，再用 `https://api-dev.birdcoder.com` 补齐剩余 identity/gateway 键。空占位会被跳过，以便后续项目 `.env` 仍能提供密钥。继承的进程 env 从不被替换。
- **production**（打包/dist）：不上溯；仅为尚未设置的名称套用 `https://api.birdcoder.com` 与生产 identity 键。

测试省略 `sdkworkEnv`，因此隔离的 `cwd` 按原样使用。ui-env 仍通过 settings `base` 层投影；`$DSH_HOME/settings.yaml` 中用户编辑过的 `ui-env:` 分区仍然权威（[env 引导与投影](../feature/2026-08-18-sdkwork-env-bootstrap-token-and-projection.zh.md)）。

## Alternatives considered

**把 ui-env schema 默认改成 `development`。** 打包安装没有 env 文件，会打到 `api-dev.birdcoder.com`。

**让 `loadLayeredEnv` 上溯父目录。** 加载器的启动范围发现是既有约定（[env 文件标准](../process/2026-08-17-sdkwork-env-file-standard.zh.md)）；父目录搜索会让从嵌套工作区运行的 CLI 感到意外。

**要求在 `desktop:dev` 之前执行 `cp .env.standalone.development .env`。** 那是 CLI 工作流；`pnpm --filter` 会把 cwd 改成 `apps/desktop`，复制后仍然加载不到。

## Consequences

`pnpm desktop:dev` 无需仓库根目录 `.env` 就会投影 `https://api-dev.birdcoder.com`。打包构建保持 `https://api.birdcoder.com`。若用户先前在设置文档中保存了 `ui-env.environment: production`，在清除该分区或改为 `development` 之前仍会看到生产环境。启动 shell 中显式设置的 `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL` 仍然优先。

## Testing

`packages/boot/sdkwork-env-bootstrap/tests` 中的包级单元测试钉住子目录上溯、受跟踪的 development 文件（跳过空占位）、打包 production origin（不上溯）以及继承 URL 的保留。文档门禁（翻译配对、链接、note 格式）校验双语文档。
