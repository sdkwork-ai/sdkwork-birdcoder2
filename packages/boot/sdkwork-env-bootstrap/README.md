---
description: "SDKWork bootstrap env glue for the harness app bins: deployment-profile resolution and bootstrap access-token materialization for source, packaged, and container launches."
kind: "package-reference"
---

# @deepseek-ai/dsh-sdkwork-env-bootstrap

English | [中文](README.zh.md)

## Summary

SDKWork bootstrap env glue for the harness app bins: resolve the deployment profile the launch environment declares (`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` / `SDKWORK_ENVIRONMENT`) and ensure a bootstrap access token exists, reusing `@sdkwork/iam-credential-entry` for token generation and env-file parsing. Source checkouts (`pnpm dsh web`, `pnpm desktop:dev`, and Vite builds under `apps/web`) first honor the repo-root `.env` when present, then fall back to the tracked `.env.standalone.<environment>` materialization for the selected lifecycle environment; packaged, npx, and container launches still fall back to `https://api.birdcoder.com`.

Per sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1, an explicitly configured `SDKWORK_ACCESS_TOKEN`, the IAM application-bootstrap registration output (`.sdkwork.local.env`), and an existing overlay token win without loading `@sdkwork/iam-credential-entry`. The development tier generates a disposable local JWT into the gitignored `.env.standalone.development.bootstrap.local` overlay wherever its gateway lives: section 6.1 attaches no locality clause to development, and the tracked development gateway accepts the generated fixture. Every other tier generates only when the active SDKWork gateway reaches this machine — a loopback literal (`localhost`, any `127.0.0.0/8` address, `::1`) or a hostname the system hosts file maps to a loopback address, which is how a developer publishes the local platform gateway under the tier's domain. Test additionally requires `--allow-test-token-generation`. Reuse is claims-based per `IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.2 — expiry, lifecycle, and manifest identity decide, never the JWT issuer, because the production gateway signs its own bootstrap credentials with the same `iss: sdkwork-iam-local` a local IAM uses; a token minted by the wrong gateway fails at request time and is regenerated then. Before any of that, IAM application bootstrap provisioning runs for every tier when operator credentials allow it (`~/.sdkwork/iam-bootstrap/<lifecycle>.json` or `SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME`/`PASSWORD`) — a production or staging launch with such credentials self-provisions and caches the environment-scoped overlay, so an expired token renews on the next launch with no manual step; staging and production fail closed only when no credentials provisioned a token (`IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.3 binds the fail-closed rule to fixture generation). Failures never throw: the caller continues with interactive IAM login as the credential fallback.

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
`pnpm build`, `pnpm desktop:dev`, and `pnpm desktop:dist` run this CLI. It calls `applySdkworkLaunchEnv` (source/dev identity, gateway, and overlay) then `ensureSdkworkBootstrapToken`, writing the gitignored overlay when generation is allowed. The same chain runs `pnpm iam:ensure` first, which provisions the runtime applications this repository declares into the IAM tenant application registry ([crate](../../../crates/sdkwork-birdcoder2-iam-application-bootstrap/src/lib.rs)); a token is only usable once the platform can resolve the `app_id` it carries. `apps/cli` and `apps/desktop` repeat the same pair at process start, before `loadLayeredEnv` freezes the launch snapshot that ui-sdkwork-env projects. The CLI auto-selects the launch profile with `resolveSdkworkLaunchProfile` (development when `agent.app.config.json` is present, otherwise production). In a source checkout the launcher walks to the repository root, applies the copied `.env` first when present, then fills any missing SDKWork identity/gateway keys from the tracked `.env.standalone.<environment>` file that matches the selected lifecycle environment, and finally copies the matching `.env.standalone.<environment>.bootstrap.local` token overlay into the frozen launch snapshot. That keeps `standalone.test` and `standalone.staging` aligned across `web`, `desktop`, and direct Vite builds.

A deployment another application injected is not an operator override: `applySdkworkLaunchEnv` first drops inherited SDKWork values that still match the marker `markInjectedSdkworkEnv` recorded (`clearInheritedInjectedSdkworkEnv`). A packaged Desktop application resolves its deployment into `process.env`, every process it spawns inherits it, so without that rule a source launch started from such a shell would adopt the packaged deployment's gateway. A value changed after the injection differs from the marker and still wins. A packaged build predating the marker leaves no provenance at all, so a source launch also drops an inherited deployment that is still exactly this module's production defaults — the production profile id together with the production gateway URL, with every other deployment key present unchanged. A partial or customized set never matches, so an operator override survives, and a developer who genuinely wants production from a source checkout still selects it through the repository `.env` layer, which is applied after the drop.
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

## Runtime invariants

No runtime invariant companion is published; this package owns no durable package-local event stream; the overlay file effect is covered by unit tests, and env-file parsing stays in the canonical `@sdkwork/iam-credential-entry` package.
