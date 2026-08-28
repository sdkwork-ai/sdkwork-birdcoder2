# Web 服务器配置（布局 v3）

English | [中文](README.md)

模块 `sdkwork-birdcoder2` · 运行时代码 `birdcoder2` · 已启用

权威文档：`SDKWORK_WEBSERVER_SPEC.md` · 主机：`APP_RUNTIME_TOPOLOGY_NAMING.md` §9。

## 布局

```text
deployments/webserver/
  server.common.toml           # identity, nginx/main/http globals, platform certs, TLS defaults, upstream skeleton
  server.development.toml      # environment = "development" — hosts + include only
  server.test.toml             # environment = "test"
  server.staging.toml          # environment = "staging"
  server.production.toml       # environment = "production"
  server.standalone.toml       # profile = "standalone" (upstream targets)
  server.cloud.toml            # profile = "cloud" (platform gateway upstream)
  snippets/gateway-locations.production.conf   # full gateway proxy (api-only edge products)
  snippets/gateway-api-locations.production.conf  # /api/ + health only (Adaptive Web modules)
  snippets/gateway-locations.nonproduction.conf   # dev/test/staging full proxy to gateway
  snippets/adaptive-web.maps.conf            # PC/H5 UA maps (web / web+api modules only)
  snippets/adaptive-web.dispatch.conf      # location / dispatch
  snippets/adaptive-web.named-locations.conf  # @pc / @h5 static roots
  app-roots.example.toml                     # process Adaptive Web dist catalog (PC/H5)
```

运行时合并：

```text
effective(<profile>.<environment>) =
  merge(server.common.toml, server.<environment>.toml, server.<profile>.toml)
```

## 生命周期环境

| 环境 | 文件 | 主机 | 示例 | 监听器 |
| --- | --- | ---: | --- | --- |
| development | `server.development.toml` | 15 | `birdcoder2-dev.sdkwork.com` | 80 |
| test | `server.test.toml` | 15 | `birdcoder2-test.sdkwork.com` | 80 |
| staging | `server.staging.toml` | 15 | `birdcoder2-staging.sdkwork.com` | 80 |
| production | `server.production.toml` | 15 | `birdcoder2.sdkwork.com` | 443 ssl + 80 |

表层：application.public-ingress。

## 刷新与校验

```bash
node sdkwork-specs/tools/webserver/align-webserver-workspace.mjs <sdkwork-space-root>
node sdkwork-specs/tools/webserver/audit-modules.mjs <sdkwork-space-root>
```

Sidecar（`nginx.enabled = true` 时必需）：`nginx.<profile>.<environment>.conf` 在 `nginx.strict = true` 时必须与 `effective(<profile>.<environment>)` 一致。用 `align-webserver-workspace.mjs` 或 `render-nginx-sidecars.mjs` 重新生成。
