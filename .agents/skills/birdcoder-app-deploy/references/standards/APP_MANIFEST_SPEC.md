# APP_MANIFEST_SPEC v3 — bundled contract

Authority: `sdkwork-specs/APP_MANIFEST_SPEC.md` (v3). This file is a distilled,
portable contract for the deploy skill; the checkout text wins when available
(see `references/standards.lock.json` for the reviewed revision). It is not a
copy of the spec and does not redefine it.

## Entry file

`<app-root>/agent.app.config.json`, `schemaVersion: 3`, `kind: "agent.app"`.
One manifest per application root; the CLI tools and schema under
`sdkwork-specs/schemas/` are the validators (§1, §15).

## Required top-level sections (§3, §15)

`app`, `backend`, `runtime`, `media`, `publish`, `artifacts`, `release`,
`security`, plus **either** `environments` **or**
`metadata.deploymentConfig: "etc/sdkwork.deployment.config.json"`.
Unknown top-level fields are rejected.

## Required fields per section (validator)

| Section | Required |
|---|---|
| `app` | `key` (lower kebab-case, globally unique), `name`, `displayName`, `officialWebsiteUrl` (http/https), `appType` |
| `backend` | an object (non-empty `accessTokenPermissionScope` is a checklist item, not a validator rule) |
| `runtime` | `family` ∈ web, mobile, desktop, server, cli, mini-program, library, plugin; `framework`; non-empty unique `supportedDeploymentProfiles` ⊆ {standalone, cloud}; `defaultDeploymentProfile` ∈ supported |
| `media` | `icons.primary`, `icons.platform[]`, `screenshots[]`, `previews[]`; each asset has a unique `id` and one of `url`, `driveUri`, `resource`, `path` |
| `publish` | `platforms[]`, `installPlatforms[]` entries are canonical `PlusPlatform` values |
| `artifacts` | `installConfig.packages[]` (unique `id`, `name`, `sourceType`, `packageFormat`, `platform`, `architecture`, `profileBinding`, `runtimeTarget`) and a resolving `installConfig.defaultPackageId` |
| `release` | non-empty `notes[]` with exactly one `current: true`; note `version` is SemVer; `packageIds` exist |
| `security` | `checksumRequired: true` requires `checksumAlgorithm` + `checksum` on enabled direct packages |

## Identity and publishing linkage (§4, §4.1)

- `app.key` is the governed application key; `app.name`/`displayName` are the
  registration name/label; `app.appType` is the backend `PlusProjectType`.
- The application, artifact, release and deployment records on the deploy
  platform are addressed by the platform app id, recorded per profile:
  `metadata.publishing.appIdByTarget["<deploymentProfile>.<environment>"] = "<appId>"`.
- The canonical profile key is `<standalone|cloud>.<development|test|staging|demo|production>`
  and matches the host's active lifecycle tier.
- Writes are read-modify-write: every other manifest section and linkage entry
  is preserved; the manifest stays under 1 MiB.

## Runtime alignment (§6, §6.1)

`runtime.family`, `runtime.framework`, `publish.platforms` and the package
`runtimeTarget` must match the application root's architecture from
`APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2. The canonical client
architectures are `pc-web`, `h5`, `capacitor`, `flutter`, `tauri`, `electron`,
`android-native`, `ios-native`, `harmony-native`, `mini-program`, `uniapp`,
`uniappx`, `unity`, `static-web`.

The publishing console's type cards are a coarser projection used when creating
the platform app record: `pc-web`, `h5`, `static-web`, `desktop`, `android`,
`ios`, `harmonyos`, `mini-program`, `api-service`. Map the manifest family to the
card; never rewrite the manifest to fit a card.

## Package matrix (§10)

Package ids, formats and the per-profile matrix live here; packaging **content**
rules are in `PACKAGING_SPEC.md`. `release.currentVersion` and
`release.latest[channel]` drive latest-download resolution (§11).

## Release entry (§12, §13)

```json
{
  "version": "MAJOR.MINOR.PATCH",
  "releaseChannel": "DEV|INTERNAL|ALPHA|BETA|RC|STABLE|HOTFIX|LTS",
  "current": true,
  "packageIds": ["..."],
  "forceUpdate": false,
  "minSupportedVersion": "0.1.0",
  "metadata": { "marketReleases": [] }
}
```

Exactly one note sets `current: true`. The release matrix is declarative; the
deploy platform's release record is created by the publish flow, not by editing
this note.

## Validation tools (§15)

`sdkwork-specs/tools/check-app-manifest-standard.mjs` (manifest),
`check-app-manifest-deployment-standard.mjs` (deployment projection). The
preflight script runs them when a checkout is available.

## Ambiguities to preserve

- The spec defines 12 runtime-root families and 13 architecture roots (including
  `-common`); the console's nine cards are a publishing projection, not the
  full standard.
- `demo` is a canonical environment in §5.1 but the host deploy profile rules
  (`SDKWORK_DEPLOY_SPEC.md` V17, `DEPLOYMENT_SPEC.md` §2) enumerate fewer
  tiers; the deploy API accepts the five tiers this skill offers.
