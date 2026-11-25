# APPLICATION_DEPLOY_LAYOUT_SPEC — bundled contract

Authority: `sdkwork-specs/APPLICATION_DEPLOY_LAYOUT_SPEC.md`. Distilled for
portability; the checkout text wins when available.

## A deployable root contains

- `agent.app.config.json`
- `specs/topology.spec.json`
- `etc/` (source profiles and `sdkwork.deployment.config.json`)
- `deployments/deploy.yaml`
- for web modules, `deployments/webserver/` with `server.common.toml`,
  `server.<environment>.toml` and `server.<profile>.toml`

## Installed layout

| Item | Path |
|---|---|
| Runtime config | `/etc/sdkwork/<code>/config.toml` |
| Secrets | `/etc/sdkwork/<code>/secrets/` |
| Binaries | `/usr/lib/sdkwork/<code>/` |
| Shared assets | `/usr/share/sdkwork/<code>/` |
| Web surfaces | `<share>/web/{pc,h5,static}/` |
| State / logs / runtime | `/var/lib`, `/var/log`, `/run` |

macOS uses `/Library/Application Support/sdkwork/<code>/`; Windows uses
`%ProgramData%\sdkwork\<code>\`. `SDKWORK_<APPLICATION_CODE>_CONFIG_FILE`
overrides the config path.

`<code>` is `topology.applicationCode`, lowercase kebab-case. Host paths use the
runtime code, never `appId` or `app.key`.

## Permissions and checks

`config.toml` 0640, `secrets/*` 0600, root directory 0750. Verification tools:
`check-application-deploy-layout.mjs`, `check-source-config-standard.mjs`,
`check-deploy-standard.mjs`.

## Docker mode

Host deploy root is `SDKWORK_SPACE_ROOT` (default `/opt/deploy`), with
module-namespaced `sdkwork-<module>/bundle/{compose,env,deploy.sh}`; shared
checkouts and dist/Drive/TLS surfaces are bind-mounted, never copied per
container.
