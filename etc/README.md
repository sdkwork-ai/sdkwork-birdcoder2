# sdkwork-birdcoder2 Source Configuration

English | [中文](README.zh.md)

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

## Client env profiles

`etc/topology/<deployment-profile>.<environment>.env` is the authority: one file per `standalone`/`cloud` profile and `development`/`test`/`staging`/`demo`/`production` environment. Client apps never restate those values; `pnpm workflow:materialize-client-env` writes each surface its framework already reads:

| Surface | File | Read by |
| --- | --- | --- |
| `apps/sdkwork-birdcoder2-pc`, `-h5`, `-pad` | `.env.<profile>.<environment>` (`VITE_*`) | `vite build --mode <profile>.<environment>` |
| `apps/web` + `apps/desktop` (shell) | root `.env.<profile>.<environment>` (`SDKWORK_*`) | `apps/web/vite.config.ts` via `loadEnv`, baked into the page |
| `apps/sdkwork-birdcoder2-flutter-mobile` | `env/sdkwork.<profile>.<environment>.json` | `flutter build --dart-define-from-file` |
| `apps/sdkwork-birdcoder2-mini-program` | `config/mini-program/runtime-env.<profile>.<environment>.json` | the mini-program build script |

`cloud` is the default deployment profile for packaging (`DSH_WEB_DEPLOYMENT_PROFILE`), and `production` is the default environment. Public `VITE_*` surfaces never carry credentials: the shell's `SDKWORK_ACCESS_TOKEN` lives in the tracked `.env.cloud.production` (with its `.env.standalone.production` twin), which the Web build bakes into the page; every other app reads its public surface only.

```bash
pnpm workflow:materialize-client-env
pnpm check:client-env
```