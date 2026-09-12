# sdkwork-birdcoder2-mini-program

Native mini program application root for BirdCoder2.

Authority: `MINI_PROGRAM_APP_ARCHITECTURE_SPEC.md` §2, `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` §2,
`APPLICATION_SPEC.md`. Package UI rules: `APP_MINI_PROGRAM_UI_SPEC.md`.

## Standard root layout

```text
sdkwork-birdcoder2-mini-program/
  .sdkwork/            # application skills and plugins
  etc/                 # source-controlled deployment profile projection
  config/
    mini-program/      # materialized runtime env (generated from the repository authority)
    host/              # platform app ids, profiles, permission and upload references
    server/ container/ # only when this root owns such a process
  docs/ scripts/ sdks/ specs/ tests/
  src/
    app.ts app.json app.wxss
    bootstrap/         # environment, runtime, sdkClients, iamRuntime, hostAdapters, routes
    shell/ routes/
    pages/__generated__/        # projection target
    subpackages/__generated__/  # projection target
  packages/            # SDKWork `mp` packages; business code lives here
  project.config.json project.private.config.json.example
```

## Architecture rule

The **SDKWork packages**, not the platform subpackages, define the source architecture.
`src/pages/__generated__/` and `src/subpackages/__generated__/` are deterministic projection
targets assembled from route contributions; they must not become the home of business code.

## Package family

Package names use the `mp` segment unless a platform-specific exception is approved:

| Package | Role |
| --- | --- |
| `@sdkwork/birdcoder2-mp-core` | Runtime/bootstrap, generated app SDK client injection, appbase IAM runtime, token manager. |
| `@sdkwork/birdcoder2-mp-commons` | Shared components, theming tokens, list/empty/loading/error states. |
| `@sdkwork/birdcoder2-mp-shell` | Shell scaffold, tab bar, navigation, route projection input. |
| `@sdkwork/birdcoder2-mp-host` | Platform adapter boundary, e.g. `src/weixin/`; feature packages must not call platform globals. |

## Build inputs

`config/mini-program/runtime-env.<deployment-profile>.<environment>.json` is generated from the
repository authority and declares `SDKWORK_RUNTIME_TARGET=mini-program`. Never hand-edit it.
`project.private.config.json` is host-local and never committed.

## Scaffold status

Standard-layout scaffold: layout, manifest, profile projection, host templates, projection
targets, and the package family boundary exist. No capability package, route projection
implementation, or platform app id is provisioned yet.
