# Application standards and publishing forms

Read this when the project's type, build output, or publishing form is not
obvious from the manifest. The manifest's runtime families are the SDKWork
standard; the publishing console's nine type cards are a coarser projection used
to address the deploy platform. Never rewrite a manifest to fit a card.

The distilled contracts beside this file carry the exact required fields:
[standards/APP_MANIFEST_SPEC.md](standards/APP_MANIFEST_SPEC.md),
[standards/APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md](standards/APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md),
[standards/PACKAGING_SPEC.md](standards/PACKAGING_SPEC.md).

## Manifest families → console card

| Root / family | Manifest signals | Console card | Default artifact form | Default deployment |
|---|---|---|---|---|
| PC web | `family: web`, `framework` react/vue/svelte, `platforms` includes `WEB` | `pc-web` | static | `ARTIFACT_RELEASE` → `WEB_NODE` |
| Pad | `family: desktop`, `framework: react-tauri`, tablet platforms | `pc-web` (or `android`/`ios` when it ships store binaries) | static / native | web node / store target |
| H5 / Capacitor | `family: mobile`, `framework: react-h5`/`react-capacitor`, platforms include `H5` | `h5` | static | `ARTIFACT_RELEASE` → `WEB_NODE` |
| Static web | `family: web`, `framework: static-html` | `static-web` | static | `ARTIFACT_RELEASE` → `WEB_NODE` |
| Desktop | `family: desktop`, Electron/Tauri | `desktop` | native | `OTA_DISTRIBUTION` → `OTA` |
| Flutter | `family: mobile`, `framework: flutter` | `android` / `ios` / `harmonyos` by declared platform | native | store submission |
| Android native | `family: mobile`, `framework: android-native` | `android` | native | `STORE_SUBMISSION` → `ENTERPRISE` |
| iOS native | `family: mobile`, `framework: ios-native` | `ios` | native | `STORE_SUBMISSION` → `TESTFLIGHT` |
| Harmony native | `APP_HARMONY` or `harmony-native` | `harmonyos` | native | `STORE_SUBMISSION` → `HARMONYOS_STORE` |
| Mini program | `family: mini-program` or uni-app with `MP*` | `mini-program` | mini-program | `MINIPROGRAM_REVIEW` → platform review |
| uni-app / uni-app x | `family` per delivery, `framework: uni-app`/`uni-app-x` | `mini-program` / `h5` / `android` / `ios` | per delivery | per delivery |
| Unity | `family: unity` per lane | `pc-web` / `desktop` / `android` / `ios` / `mini-program` | per lane | per lane |
| API service | `family: server` | `api-service` | server-bundle | `ARTIFACT_RELEASE` → `CONTAINER` |

A family that resolves to no card is ambiguous for publishing: fix the manifest
(`runtime`/`publish.platforms`) instead of guessing. The preflight script
reports the card and the family it derived.

## Build output per architecture

| Architecture | Output to publish |
|---|---|
| PC / H5 / static web | the framework's `dist/` (or `build/`, `out/`, `.output/`, `public/`) |
| PC+H5 adaptive web pair | `dist/<standalone|cloud>/<dev|test|staging|prod>/` — one selected profile/environment directory, never the whole `dist/` |
| API service | the server build output |
| Desktop / mobile native | the per-OS installer or store binary |
| Mini program | the platform CLI build output |

## Industry forms

| Industry form | How it publishes here | Overrides |
|---|---|---|
| Static site, SSG (Next export, Astro, VitePress) | static artifact to a web node | none |
| SPA (React, Vue, Svelte) | static artifact to a web node | none |
| SSR / Node or Bun server (Next server, Nuxt, Remix, Express) | server bundle to a container | `artifactForm: server-bundle`, `deploymentTarget: CONTAINER` |
| Containerized service (Docker image) | generic artifact; the platform's container rollout owns the runtime | `artifactForm: generic`, `deploymentKind: CONTAINER_ROLLOUT`, `deploymentTarget: CONTAINER` |
| PWA | static artifact; the service worker ships in the build | none |
| Electron / Tauri desktop | native artifact, per-OS package | `artifactForm: native`, `deploymentKind: OTA_DISTRIBUTION`, `deploymentTarget: OTA` |
| Capacitor / React Native / Flutter mobile | native artifact per platform | `artifactForm: native` |
| Unity / game build | native or generic artifact | choose by the target runtime |
| WeChat / Alipay / Douyin mini program | mini-program artifact, platform review | `deploymentTarget` names the review channel |
| HarmonyOS app | native artifact, store review | `deploymentTarget: HARMONYOS_STORE` |
| Enterprise / MDM distribution | native artifact + enterprise target | `deploymentKind: ENTERPRISE_DISTRIBUTION`, `deploymentTarget: ENTERPRISE` |
| Static documentation / docs site | static artifact | none |
| Jamstack with functions | static artifact + a separate API service deployment | two publishes, one application each |

Forms this platform does not provide, and must not be faked: page-view or traffic
analytics; per-request serverless function uploads; a raw registry push from the
conversation; signed store uploads without the signing identity configured in
the console.

## Choosing an override

The tool's defaults follow the manifest. Override only when the deployment form
differs from the application type, and say why in the reply:

- `artifactForm` — the artifact the platform registers;
- `platformTarget` — the platform target key, when the app has several;
- `deploymentKind` / `deploymentTarget` — where that artifact lands;
- `environment` — the lifecycle tier.

Read [deployment-targets.md](deployment-targets.md) for the accepted pairs
before overriding.
