# Web Server Configuration (layout v3)

English | [中文](README.zh.md)

Module `sdkwork-birdcoder2` · runtime code `birdcoder2` · enabled

Authority: `SDKWORK_WEBSERVER_SPEC.md` · hosts: `APP_RUNTIME_TOPOLOGY_NAMING.md` §9.

## Layout

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

Merge at runtime:

```text
effective(<profile>.<environment>) =
  merge(server.common.toml, server.<environment>.toml, server.<profile>.toml)
```

## Lifecycle environments

| Environment | File | Hosts | Example | Listeners |
| --- | --- | ---: | --- | --- |
| development | `server.development.toml` | 15 | `birdcoder2-dev.sdkwork.com` | 80 |
| test | `server.test.toml` | 15 | `birdcoder2-test.sdkwork.com` | 80 |
| staging | `server.staging.toml` | 15 | `birdcoder2-staging.sdkwork.com` | 80 |
| production | `server.production.toml` | 15 | `birdcoder2.sdkwork.com` | 443 ssl + 80 |

Surfaces: application.public-ingress.

## Refresh and validate

```bash
node sdkwork-specs/tools/webserver/align-webserver-workspace.mjs <sdkwork-space-root>
node sdkwork-specs/tools/webserver/audit-modules.mjs <sdkwork-space-root>
```

Sidecars (required when `nginx.enabled = true`): `nginx.<profile>.<environment>.conf` must match `effective(<profile>.<environment>)` when `nginx.strict = true`. Regenerate with `align-webserver-workspace.mjs` or `render-nginx-sidecars.mjs`.
