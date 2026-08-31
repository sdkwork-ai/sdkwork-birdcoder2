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
