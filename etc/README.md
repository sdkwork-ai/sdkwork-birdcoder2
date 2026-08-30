# sdkwork-birdcoder2 Source Configuration

<!-- SDKWORK-DEPLOY-LAYOUT: v1 -->
## Installed Runtime Paths

Authority: `APPLICATION_DEPLOY_LAYOUT_SPEC.md` (`../sdkwork-specs/`).

| Item | Value |
| --- | --- |
| `appId` | `sdkwork-birdcoder2` |
| `runtimeCode` | `birdcoder2` |
| Config root | `/etc/sdkwork/birdcoder2/` |
| Runtime TOML | `/etc/sdkwork/birdcoder2/config.toml` |
| Secrets | `/etc/sdkwork/birdcoder2/secrets/` |
| Override | `SDKWORK_BIRDCODER2_CONFIG_FILE` |

Source profiles live under `etc/` (`sdkwork.deployment.config.json` index). Deploy manifest: `deployments/deploy.yaml`. Web data-plane source: `deployments/webserver/` (`SDKWORK_WEBSERVER_SPEC.md` layout v3).

```bash
node ../sdkwork-specs/tools/check-source-config-standard.mjs --root .
node ../sdkwork-specs/tools/check-application-deploy-layout.mjs --root .
node ../sdkwork-specs/tools/check-webserver-toml-standard.mjs --root deployments/webserver
```
<!-- /SDKWORK-DEPLOY-LAYOUT -->