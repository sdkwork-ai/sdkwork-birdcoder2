# Deployment targets and lifecycle tiers

Read this before overriding the deployment form, or when the result reports a
rejected `createDeployment` stage.

## Artifact forms

These are the **deploy platform's** artifact registration table
(`deploy_artifact.package_type`), not the manifest's package matrix. The
manifest's package ids/formats live in `APP_MANIFEST_SPEC.md` §10 and
`NAMING_SPEC.md`; packaging content rules live in `PACKAGING_SPEC.md`.

| `artifactForm` | `package_type` | Use for |
|---|---|---|
| `static` | 1 | static site, SPA, SSG, H5, PC web build |
| `native` | 2 | installers and store binaries (desktop, Android, iOS, HarmonyOS) |
| `mini-program` | 3 | WeChat / Alipay / Douyin mini-program bundles |
| `server-bundle` | 4 | Node, Bun, Java or Go server builds that run in a container |
| `generic` | 5 | container images, source scaffolds, anything outside the four |

The tool defaults to the form its type table assigns to the application type.

## Deployment kinds and targets

| Kind | Target | Meaning |
|---|---|---|
| `ARTIFACT_RELEASE` | `WEB_NODE` | an artifact serves a web environment |
| `ARTIFACT_RELEASE` | `CONTAINER` | an artifact serves a container environment |
| `STORE_SUBMISSION` | `APP_STORE_CONNECT` | App Store Connect submission |
| `STORE_SUBMISSION` | `TESTFLIGHT` | TestFlight distribution |
| `STORE_SUBMISSION` | `HARMONYOS_STORE` | HarmonyOS AppGallery submission |
| `STORE_SUBMISSION` | `ENTERPRISE` | enterprise / MDM distribution of a native build |
| `MINIPROGRAM_REVIEW` | `WECHAT_REVIEW` | WeChat mini-program review |
| `MINIPROGRAM_REVIEW` | `DOUYIN_REVIEW` | Douyin mini-program review |
| `OTA_DISTRIBUTION` | `OTA` | desktop over-the-air update |
| `ENTERPRISE_DISTRIBUTION` | `ENTERPRISE` | managed desktop/mobile distribution |
| `CONTAINER_ROLLOUT` | `CONTAINER` | container rollout |
| `SITE_CONFIG` | `WEB_NODE` | site configuration change, no new artifact |
| `TLS_CONFIG` | `WEB_NODE` | certificate change, no new artifact |

A pair the platform rejects comes back as the failed `createDeployment` stage
with the server message; do not retry the same pair.

## Hostnames, bindings and health

- The platform assigns default hostnames per environment. Before a canonical
  binding is read, the result reports the platform's default
  `<appDomainLabel>.app.<suffix>` (or `<label>.<brand suffix>` when the platform
  exposed no suffix catalog) and marks it `domainDefault`. Custom hostnames are
  registered in the site panel's 站点管理 view or the console and verified by
  DNS; a publish does not make a custom hostname verified.
- The result's `siteUrl` is the canonical hostname for the environment, or the
  default pattern above when no binding exists yet.
- Health checks are platform probes, not Session checks. The site panel's
  观测数据 view lists them.
- Usage events are metering (build minutes, storage, deployment counts), not web
  traffic; page-view analytics do not exist here.

## Lifecycle tiers

`development`, `test`, `staging`, `demo`, `production`, per
`ENVIRONMENT_SPEC.md` §5.1 (`<deploymentProfile>.<environment>`). The manifest's
`runtime.defaultDeploymentProfile` (`standalone` or `cloud`) plus the Host tier
selects the project's canonical linkage key, for example `cloud.production`.
Publish to `production` only when the request names production or the
application already serves there. The host deploy rules enumerate fewer tiers
(`SDKWORK_DEPLOY_SPEC.md` V17, `DEPLOYMENT_SPEC.md` §2); the deploy platform API
accepts the five this skill offers.

## Production checklist

1. The build output is the release build, not a development build.
2. The version is new; an existing version is bumped automatically.
3. The environment is the requested tier.
4. The deployment kind and target match the artifact form.
5. The result's deployment status was read back, and the previous deployment id
   is recorded for rollback.
