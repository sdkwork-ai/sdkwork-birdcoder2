# @deepseek-ai/dsh-sdkwork-env-bootstrap

English | [中文](README.zh.md)

SDKWork bootstrap env glue for the harness app bins: resolve the deployment profile the launch environment declares (`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` / `SDKWORK_ENVIRONMENT`) and ensure a bootstrap access token exists, reusing `@sdkwork/iam-credential-entry` for token generation and env-file parsing. Source checkouts (`pnpm dsh web`, `pnpm desktop:dev`) apply `.env.standalone.development` (gateway `http://api-dev.birdcoder.com`); packaged, npx, and container launches apply `https://api.birdcoder.com`.

Per sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1, an explicitly configured `SDKWORK_ACCESS_TOKEN`, the IAM application-bootstrap registration output (`.sdkwork.local.env`), and an existing overlay token win without loading `@sdkwork/iam-credential-entry`; otherwise development generates a disposable local JWT into the gitignored `.env.standalone.development.bootstrap.local` overlay, test requires `--allow-test-token-generation`, and staging/production fail closed to a private secret source. Failures never throw: the caller continues with interactive IAM login as the credential fallback.

The module deliberately copies none of the canonical SDKWork logic: JWT creation, manifest identity lookup, env merge, bootstrap env-file parsing, and serialization all stay in `@sdkwork/iam-credential-entry`, which is loaded dynamically so a harness without the SDKWork sibling checkouts still boots. An existing overlay is parsed with `node:util.parseEnv` so `pnpm desktop:dev` still projects the token when that dynamic import cannot resolve.

## Usage

```sh
pnpm env:token:ensure [--allow-test-token-generation]
```

`pnpm build`, `pnpm desktop:dev`, and `pnpm desktop:dist` run this CLI. It calls `applySdkworkLaunchEnv` (source/dev identity, gateway, and overlay) then `ensureSdkworkBootstrapToken`, writing the gitignored overlay when generation is allowed. `apps/cli` and `apps/desktop` repeat the same pair at process start, before `loadLayeredEnv` freezes the launch snapshot that ui-env projects. The CLI auto-selects the launch profile with `resolveSdkworkLaunchProfile` (development when `sdkwork.app.config.json` is present, otherwise production). The desktop shell passes an explicit profile because a packaged app may chdir to a homedir that happens to contain a checkout. Development walks to the repository root and fills unset identity/gateway keys from `.env.standalone.development`; production fills the production gateway without walking.

## Model Experience

None, as the package runs on the host side only and writes a gitignored overlay file without touching a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Token refresh is manual**: an overlay token is reused until the file is deleted (or the overlay is removed), so an expired 24-hour fixture JWT requires deleting the overlay and restarting. The canonical package owns token validity; this module does not decode JWTs.
- **Browser runtimes never register or generate**: token generation happens in host launchers only, per `IAM_APPLICATION_BOOTSTRAP_SPEC.md`.
