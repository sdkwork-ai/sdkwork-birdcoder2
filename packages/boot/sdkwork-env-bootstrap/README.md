---
description: "SDKWork bootstrap env glue for the harness app bins: deployment-profile resolution and bootstrap access-token materialization for source, packaged, and container launches."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-env-bootstrap

English | [中文](README.zh.md)

## Summary

SDKWork bootstrap env glue for the harness app bins: resolve the deployment profile the launch environment declares (`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` / `SDKWORK_ENVIRONMENT`) and ensure a bootstrap access token exists, reusing `@sdkwork/iam-credential-entry` for token generation and env-file parsing. Source checkouts (`pnpm dsh web`, `pnpm desktop:dev`, and Vite builds under `apps/web`) first honor the repo-root `.env` when present, then fall back to the tracked `.env.standalone.<environment>` materialization for the selected lifecycle environment; packaged, npx, and container launches still fall back to `https://api.birdcoder.com`.

Per sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1, an explicitly configured `SDKWORK_ACCESS_TOKEN`, the IAM application-bootstrap registration output (`.sdkwork.local.env`), and an existing overlay token win without loading `@sdkwork/iam-credential-entry`. Development and explicitly allowed test runs generate a disposable local JWT into the gitignored `.env.standalone.<environment>.bootstrap.local` overlay only when the active SDKWork gateway is loopback (`localhost` / `127.0.0.1` / `::1`); remote gateways must use a real provisioned token instead. Staging and production always fail closed to a private secret source. Failures never throw: the caller continues with interactive IAM login as the credential fallback.

The module deliberately copies none of the canonical SDKWork logic: JWT creation, manifest identity lookup, env merge, bootstrap env-file parsing, and serialization all stay in `@sdkwork/iam-credential-entry`, which is loaded dynamically so a harness without the SDKWork sibling checkouts still boots. An existing overlay is parsed with `node:util.parseEnv` so `pnpm desktop:dev` still projects the token when that dynamic import cannot resolve.

## Table of Contents

- [Usage](#usage)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)
## Usage
```sh
pnpm env:token:ensure [--allow-test-token-generation]
```
`pnpm build`, `pnpm desktop:dev`, and `pnpm desktop:dist` run this CLI. It calls `applySdkworkLaunchEnv` (source/dev identity, gateway, and overlay) then `ensureSdkworkBootstrapToken`, writing the gitignored overlay when generation is allowed. `apps/cli` and `apps/desktop` repeat the same pair at process start, before `loadLayeredEnv` freezes the launch snapshot that ui-sdkwork-env projects. The CLI auto-selects the launch profile with `resolveSdkworkLaunchProfile` (development when `sdkwork.app.config.json` is present, otherwise production). In a source checkout the launcher walks to the repository root, applies the copied `.env` first when present, then fills any missing SDKWork identity/gateway keys from the tracked `.env.standalone.<environment>` file that matches the selected lifecycle environment, and finally copies the matching `.env.standalone.<environment>.bootstrap.local` token overlay into the frozen launch snapshot. That keeps `standalone.test` and `standalone.staging` aligned across `web`, `desktop`, and direct Vite builds.
## Model Experience
None, as the package runs on the host side only and writes a gitignored overlay file without touching a model request.
#### KV Cache effect
None; this package neither assembles nor sends provider requests.
## Known Limitations and Deferred Work
- **Token refresh is manual**: an overlay token is reused until the file is deleted (or the overlay is removed), so an expired 24-hour fixture JWT requires deleting the overlay and restarting. The canonical package owns token validity; this module does not decode JWTs.
- **Browser runtimes never register or generate**: token generation happens in host launchers only, per `IAM_APPLICATION_BOOTSTRAP_SPEC.md`.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The token-resolution order (explicit `SDKWORK_ACCESS_TOKEN` > IAM registration output > existing overlay > generated fixture) mirrors sdkwork-specs `ENVIRONMENT_SPEC.md` §6.1; keep that section and this module in step when the spec moves. The dynamic `@sdkwork/iam-credential-entry` import is load-bearing for sibling-less checkouts — do not hoist it to a static import.

</details>
