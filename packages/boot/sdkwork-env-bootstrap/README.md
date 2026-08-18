# @deepseek-ai/dsh-sdkwork-env-bootstrap

English | [中文](README.zh.md)

SDKWork bootstrap env glue for the harness app bins: resolve the deployment profile the launch environment declares (`SDKWORK_PROFILE_ID` / `SDKWORK_BIRDCODER_ENVIRONMENT` / `SDKWORK_ENVIRONMENT`) and ensure a bootstrap access token exists, reusing `@sdkwork/iam-credential-entry` for token generation and env-file parsing. Unpackaged `pnpm desktop:dev` applies `.env.standalone.development` (gateway `https://api-dev.birdcoder.com`); a packaged desktop build applies `https://api.birdcoder.com`.

Per sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1, an explicitly configured `SDKWORK_ACCESS_TOKEN` and the IAM application-bootstrap registration output (`.sdkwork.local.env`) win; otherwise development generates a disposable local JWT into the gitignored `.env.standalone.development.bootstrap.local` overlay, test requires `--allow-test-token-generation`, and staging/production fail closed to a private secret source. Failures never throw: the caller continues with interactive IAM login as the credential fallback.

The module deliberately copies none of the canonical SDKWork logic: JWT creation, manifest identity lookup, env merge, bootstrap env-file parsing, and serialization all stay in `@sdkwork/iam-credential-entry`, which is loaded dynamically so a harness without the SDKWork sibling checkouts still boots.

## Usage

```sh
pnpm exec tsx packages/boot/sdkwork-env-bootstrap/src/bin.ts [--allow-test-token-generation]
```

Or call `ensureSdkworkBootstrapToken` from a launcher after the layered `.env` load; `apps/cli` and `apps/desktop` do this at startup. The desktop shell also calls `applySdkworkDesktopLaunchEnv` first: unpackaged `desktop:dev` walks to the repository root and fills unset identity/gateway keys from `.env.standalone.development`; a packaged build fills the production gateway.

## Model Experience

None, as the package runs on the host side only and writes a gitignored overlay file without touching a model request.

#### KV Cache effect

None; this package neither assembles nor sends provider requests.

## Known Limitations and Deferred Work

- **Token refresh is manual**: an overlay token is reused until the file is deleted (or the overlay is removed), so an expired 24-hour fixture JWT requires deleting the overlay and restarting. The canonical package owns token validity; this module does not decode JWTs.
- **Browser runtimes never register or generate**: token generation happens in host launchers only, per `IAM_APPLICATION_BOOTSTRAP_SPEC.md`.
