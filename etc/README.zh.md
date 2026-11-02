# sdkwork-birdcoder2 源码配置

[English](README.md) | 中文

<!-- SDKWORK-DEPLOY-LAYOUT: v1 -->
## 已安装运行时路径

权威依据：`APPLICATION_DEPLOY_LAYOUT_SPEC.md`（`../sdkwork-specs/`）。

| 项目 | 值 |
| --- | --- |
| `appId` | `sdkwork-birdcoder2` |
| `runtimeCode` | `birdcoder2` |
| 配置根目录 | `/etc/sdkwork/birdcoder2/` |
| 运行时 TOML | `/etc/sdkwork/birdcoder2/config.toml` |
| 密钥 | `/etc/sdkwork/birdcoder2/secrets/` |
| 覆盖 | `SDKWORK_BIRDCODER2_CONFIG_FILE` |

源码配置文件位于 `etc/` 下（`sdkwork.deployment.config.json` 索引）。部署清单：`deployments/deploy.yaml`。Web 数据面源码：`deployments/webserver/`（`SDKWORK_WEBSERVER_SPEC.md` v3 布局）。

```bash
node ../sdkwork-specs/tools/check-source-config-standard.mjs --root .
node ../sdkwork-specs/tools/check-application-deploy-layout.mjs --root .
node ../sdkwork-specs/tools/check-webserver-toml-standard.mjs --root deployments/webserver
```
<!-- /SDKWORK-DEPLOY-LAYOUT -->

## 客户端 env 档位

`etc/topology/<deployment-profile>.<environment>.env` 是权威来源：`standalone`/`cloud` 两个部署档位，`development`/`test`/`staging`/`demo`/`production` 五个环境各一份。客户端应用不重复声明这些值；`pnpm workflow:materialize-client-env` 为每个面写出各框架本来就会读取的文件：

| 面 | 文件 | 读取方 |
| --- | --- | --- |
| `apps/sdkwork-birdcoder2-pc`、`-h5`、`-pad` | `.env.<profile>.<environment>`（`VITE_*`） | `vite build --mode <profile>.<environment>` |
| `apps/web` + `apps/desktop`（外壳） | 仓库根 `.env.<profile>.<environment>`（`SDKWORK_*`） | `apps/web/vite.config.ts` 的 `loadEnv`，烘焙进页面 |
| `apps/sdkwork-birdcoder2-flutter-mobile` | `env/sdkwork.<profile>.<environment>.json` | `flutter build --dart-define-from-file` |
| `apps/sdkwork-birdcoder2-mini-program` | `config/mini-program/runtime-env.<profile>.<environment>.json` | 小程序构建脚本 |

打包默认部署档位是 `cloud`（`DSH_WEB_DEPLOYMENT_PROFILE`），默认环境是 `production`。公开的 `VITE_*` 面从不携带凭据：外壳的 `SDKWORK_ACCESS_TOKEN` 位于受跟踪的 `.env.cloud.production`（以及 `.env.standalone.production` 孪生文件），由 Web 构建烘焙进页面；其它应用只读取各自的公开面。

```bash
pnpm workflow:materialize-client-env
pnpm check:client-env
```
