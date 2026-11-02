# Agent Note: A packaged Desktop release carries its SDKWork deployment

Status: implemented

Superseded by [2026-11-02-vite-env-configuration.md](2026-11-02-vite-env-configuration.md): SDKWork configuration now comes from the committed Vite env file the Web build bakes into the page. The release-environment artifact, the distribution class, and the application-identity resource this note introduced are deleted.

English | [中文](2026-11-01-desktop-release-sdkwork-env.zh.md)

## Problem

The bootstrap ladder itself — which credential sources win, and how a generated or registered token is reused — is owned by [2026-08-18-sdkwork-env-bootstrap-token-and-projection.md](2026-08-18-sdkwork-env-bootstrap-token-and-projection.md); this note adds the packaged path.

A source launch and an installed application resolved different SDKWork deployments from the same configuration. `apps/desktop-host/src/launch-environment.ts` applies the SDKWork launch environment at process start; in a source checkout it re-walks to the repository root, where the tracked `.env.<deployment-profile>.<lifecycle>` carries the deployment and the user-private credential bundle `~/.sdkwork/<application-code>/credentials/<profile-id>.json` carries its bootstrap credential, so `pnpm desktop:prod --insecure-tls` authenticated. An installed application runs from its own home, which contains no checkout and no credential bundle: the same code resolved the production identity and gateway from the built-in defaults but found no credential, so the renderer's generated SDK failed every access-token-only request with `access-token-only request requires Access-Token before request dispatch` while interactive login was the only credential source. A test- or staging-tier build had the opposite defect: it silently resolved the production gateway because the baked deployment selection did not exist either.

The first fix made the artifact opt-in (`DSH_DESKTOP_SDKWORK_RELEASE_ENV=1`), which preserved the failure as the default: a packaging run that forgot the switch produced an installable application that could not authenticate, and the defect surfaced only when a user submitted a credentials form. The opt-in also left packaging free to provision a credential, so a build could silently regenerate a token an operator had already settled.

## Decision

### Distribution class decides, and `deployment` is the default

`DSH_DESKTOP_DISTRIBUTION` names the class of the artifact being produced, per sdkwork-specs `ENVIRONMENT_SPEC.md` section 6.1.1. `deployment` is the default because an undeclared build must not be the broken one; `public` is declared explicitly by a lane that publishes a general-purpose release. The legacy `DSH_DESKTOP_SDKWORK_RELEASE_ENV` still maps (`1` → `deployment`, `0` → `public`) for one migration window, and the new variable outranks it.

### Packaging is a read-only projection

Preparing the artifact is the `resolve` phase of `ENVIRONMENT_SPEC.md` section 6.1. `prepare:sdkwork-env` (`apps/desktop/scripts/prepare-sdkwork-release-env.ts`) runs `applySdkworkLaunchEnv` and then `ensureSdkworkBootstrapToken` with `credentialWrite: 'forbid'`, so it may reuse a cached credential and never registers, provisions, signs, or generates one. `pnpm env:token:ensure --environment <lifecycle>` is the single supported write entry point; `--refresh` replaces a reusable credential, and `--resolve-only` runs the same resolution for build lanes that never write. The lifecycle comes from `DSH_DESKTOP_SDKWORK_ENVIRONMENT` (production by default), the inherited deployment-selection keys are dropped first, and a `deployment` build without a reusable credential fails with the command that repairs it.

### The artifact is narrow

The step writes `resources/sdkwork-release.env` through `renderSdkworkReleaseEnv` with only `SDKWORK_RELEASE_ENV_KEYS`: deployment selection, SDKWork surface URLs, the registration claims the credential bundle carries, and `SDKWORK_ACCESS_TOKEN`. Model provider keys, operator bootstrap credentials, database URLs, and `VITE_*` / `PORTAL_PUBLIC_*` values are not on the list and are reported and ignored when a hand-edited file declares them. The projected credential is byte-identical to the cached one, so expiry, rotation, and revocation behave the same in both carriers.

### Both classes name the application, only the credential is class-scoped

`sdkwork-app.json` records the manifest `app.key` with its vendor prefix removed
(`birdcoder2`). `prepare:sdkwork-env` writes it into the target build root for
every distribution class, `extraResources` copies it to
`resources/sdkwork-app.json`, and `src/main.ts` resolves it before starting the
Host and passes `SDKWORK_APPLICATION_CODE` through the Host environment. An
installed launch therefore names `~/.sdkwork/<application-code>/credentials/`
instead of deriving the directory from the profile directory it happens to run in
(`<home>/profiles/desktop`). The file holds no credential, so a public release
carries it while still refusing the release environment.

### The release lane tracks its deployment credential (fork divergence)

The release lane has no secret-manager or runner-provisioned credential source, so
this fork lets its tracked materialization carry the deployment's
`SDKWORK_ACCESS_TOKEN`. `.env.standalone.production` holds the value, the operator
fills it once with `pnpm env:token:ensure --environment production`, and
`prepare:sdkwork-env` reads it like any other tracked value and projects it into
the artifact. The reuse check still decides usability: packaging reuses an
unexpired token whose `environment`, `app_id`, and tenant claims match this
manifest and fails on anything else, so refreshing the credential is a tracked
commit rather than a secret rotation. `ENVIRONMENT_SPEC.md` section 5.1.7 treats
that token as a private bootstrap credential and expects a secret manager; the
divergence is deliberate because the installed application already carries the
same value in `resources/sdkwork-release.env`, and the lane's public releases
would otherwise install an application that cannot dispatch a login request.

### The installed application applies it before resolving

The Desktop main process passes the resource path as `DSH_DESKTOP_SDKWORK_RELEASE_ENV_FILE`; `resolveSdkworkReleaseEnvFile` prefers an explicit path from the launching environment, otherwise the packaged resource, and a source launch passes none. The Host calls `applySdkworkReleaseEnv` before `applySdkworkLaunchEnv`, so the artifact fills names the launch environment leaves blank and an operator override always outranks it. The token then takes the ordinary `IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4 path: a still-valid credential is reused unchanged, and when the projected one is no longer reusable the Host reports the artifact path, the remedy, and the provisioning command, because a `deployment` build cannot authenticate through interactive login either.

### One explicit command owns the write

`pnpm env:token:ensure --environment <tier>` pins the lifecycle and drops the inherited deployment selection, so a developer can write the production or test credential bundle the deployment build reads instead of always resolving the development fixture; `--allow-test-token-generation` still gates the disposable test fixture, and `--refresh` is the only replacement path. `pnpm build` runs it with `--resolve-only`, so preparing artifacts reuses a token and never creates one.

### The specifications now say so

Three spec surfaces carry the rule, so a repository cannot re-derive the opt-in by accident: `ENVIRONMENT_SPEC.md` section 6.1 gained the `resolve` / `provision` / `refresh` consumer table, section 6.1.1 became the distribution-class contract with a packaging failure instead of a warning, and section 6.1.2 added source-launch and packaged parity (same resolver, same key set, projection rather than regeneration). `IAM_APPLICATION_BOOTSTRAP_SPEC.md` section 5.4.5 binds packaging to copy-only behaviour, and `DESKTOP_APP_ARCHITECTURE_SPEC.md` turned its two `MAY` statements into per-class `MUST` / `MUST NOT`.

## Alternatives considered

**Keep the opt-in.** That is the defect: the safe path was the one you had to remember, and forgetting it produced an artifact that installs, starts, and then fails at the credentials form. A default that cannot authenticate is not a safe default.

**Let packaging provision the credential when the cache is empty.** It would make one command produce a working artifact, and it would also make every build depend on network state plus hidden operator credentials, regenerate a value an operator had settled, and hide a real misconfiguration behind a successful build. Failing with the repair command keeps the write authority where the spec puts it.

**Always bake the artifact.** A public release would then ship whatever credential the release engineer happened to have configured. The declared class keeps the public lane credential-free, and `ENVIRONMENT_SPEC.md` section 6.1.1 states the distribution rule.

**Require a release secret instead of tracking the value.** That keeps the credential out of the checkout and is the shape `ENVIRONMENT_SPEC.md` section 5.1.7 expects. It also makes each release depend on a repository setting no file records and on the target machine's own provisioning, which is the failure this note fixes: the artifact authenticates only where someone already installed the credential. The tracked value keeps the source visible in the diff that refreshes it.

**Keep relying on the installed machine's own credential bundle or operator credentials.** That already works when an operator provisions `~/.sdkwork/iam-bootstrap/<lifecycle>.json` on the target machine, and it is the renewal path. It does not help a deployment build installed without that setup, which is the failing case: the packaging host had the credential and the installed application did not.

**Bake only `SDKWORK_ACCESS_TOKEN`.** The default gateway happens to match a production token, but a test or staging build would send that credential to the production gateway, and the deployment identity would still be implicit. Shipping the selection keys makes the artifact describe the deployment it authenticates to.

**Bake the operator credentials as well.** It would let the installed application renew without the target machine's setup. It also multiplies the secret material in the artifact and makes the build's identity depend on an operator account. The artifact instead carries one revocable bootstrap credential, and renewal stays with the host's own operator profile or login.

## Consequences

A `deployment` build reaches its SDKWork gateway and authenticates without depending on the installing user's shell environment, and a test- or staging-tier build reaches the right gateway instead of the production default. An installed build of either class names the same credential bundle the packaging host provisioned, so a public release reuses a provisioned credential instead of looking under `~/.sdkwork/desktop/`. Forgetting to declare a class now produces a credential-carrying artifact rather than a broken one, and a public lane must say `public` out loud. The release lane's credential is a tracked value, so it is published with the repository and with every artifact it builds: rotating it means revoking the token, refreshing `.env.standalone.production`, and re-running packaging, and the lane fails closed the moment its claims stop matching. Packaging can no longer move a token: builds reuse what `env:token:ensure` settled, so a stale or revoked credential surfaces as an explicit packaging or launch failure instead of a different token than the one an operator inspected. The artifact still contains a revocable bootstrap credential, so it belongs only to the deployment it was built for, and refreshing it means re-running the explicit command and repackaging.

## Verification

`pnpm exec vitest run packages/boot/sdkwork-env-bootstrap/tests apps/desktop-host/tests/launch-environment.spec.ts apps/desktop/tests/prepare-sdkwork-release-env.spec.ts apps/desktop/tests/sdkwork-app-identity.spec.ts apps/desktop/tests/sdkwork-release-env.spec.ts apps/desktop/tests/package-target-stages.spec.ts apps/desktop/tests/desktop-package-environment.spec.ts` covers the allowlist, rendering, parsing, precedence and deployment-selection clearing, the Host's artifact application and operator precedence, the resolve-phase refusal to create a credential, refresh skipping the value it was asked to replace, the packaging step's distribution classes and missing-token failure, the application identity both classes carry, the packaging gate that refuses a `deployment` build without an artifact, the resource path the shell passes, and the packaging stage that runs the step under the download environment. A local simulation of the installed path — an empty home directory with and without the artifact — resolves `standalone.production` / `https://api.birdcoder.com` in both cases, with no token before and the packaging host's production token after.
