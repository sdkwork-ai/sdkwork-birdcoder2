# Agent Note: A pinned production launch runs on the committed public application token

Status: implemented

English | [中文](2026-11-12-pinned-production-bootstrap-token.zh.md)

## Problem

`pnpm desktop:prod` forces `standalone.production` and runs the Desktop Host from a profile directory inside the checkout, so `applySdkworkLaunchEnv` saw a production profile whose invoking directory differed from the repository root, applied the production defaults, and returned before reading the tracked `.env.standalone.production` materialization or the credential bundle. The frozen launch snapshot then carried no `SDKWORK_ACCESS_TOKEN` at all, even though the tracked file holds the deployment's public application access token, whose `exp` is a rotation ceiling in 2100 rather than a session lifetime.

Two smaller defects kept the repair from happening on its own. The reuse check read the public token's explicit no-expiry sentinel (`exp: 0`) as a 1970 expiry, so a spec-compliant committed token counted as stale; and `ensureSdkworkBootstrapToken` deleted a stale configured token and then failed closed for staging and production without considering the committed token. Every app-api call ran on whatever the renderer happened to keep — the page's build-time token or a private credential that had already expired.

The credential that remained had a defect of its own. The IAM binds a public application access token to an enabled `iam_tenant_application` row by the token's `app_id` claim and by the row's lifecycle environment, and this fork's six tracked root profiles carried the manifest `app.key` (`sdkwork-birdcoder2`) instead of the runtime application id the platform registered (`app_01a18b4f-6f61-7ff1-b86c-75b54995883f`, the value the deployment already records as `SDKWORK_APP_ID`). Every `credential-entry-bootstrap` route — the register and login popups included — answered `invalid or expired IAM access token`; a probe matrix against `POST /app/v3/api/auth/registrations` returned 40103 for `sdkwork-birdcoder`, `sdkwork-birdcoder2`, and `sdkwork-iam`, and reached body validation for `app_01a18b4f-…` at `production`.

## Decision

A production launch that a source checkout pins itself keeps the invoking directory as its project layer, because the checkout's `.env` describes a developer source run rather than that deployment, but it resolves the pinned profile's tracked materialization and credential bundle like any other source launch. That materialization owns the non-expiring public application access token, so the pin no longer discards the one credential the launch is meant to run on.

`ensureSdkworkBootstrapToken` treats `exp: 0` and an absent `exp` as never expiring, and, for staging and production, uses the tracked materialization's reusable token before failing closed — after operator-credential provisioning, which remains the preferred private source. A dropped token is reported as expired or tier-mismatched instead of being described as a disposable fixture.

The six tracked root profiles now carry the registered runtime application id, and the root manifest declares that same id as `backend.appId` — the field `IAM_APPLICATION_BOOTSTRAP_SPEC.md` names as the sole manifest-derived runtime identity and the value `APP_ACCESS_TOKEN_SPEC.md` requires in the token's `aud`/`app_id`. Provisioning from the manifest therefore requests the id the committed tokens already carry, instead of letting a deployment assign a fresh `app_<uuid>` that no committed token can match.

## Alternatives considered

**Force the token in the online lane's launcher.** `onlineLaunchEnvironment` already forces the identity and gateway of `standalone.production`, so it could force the token from the tracked file too. That leaves the same hole for `dsh --environment production` and for any other launcher that pins a profile from inside a checkout, and it puts credential ownership in a debug lane instead of the resolver every launcher shares.

**Keep failing closed for production.** The fail-closed rule exists so a build never mints a credential; the committed public application token is not minted, not private, and is the credential `APP_ACCESS_TOKEN_SPEC` names for this position. Failing closed while a valid committed token sits in the checkout is what produced the reported error.

**Treat `exp: 0` as expired.** Rejected: `APP_ACCESS_TOKEN_SPEC` defines `0` as never expiring, and doing so made the canonical generator's own default unreusable.

**Leave `backend.appId` as the legacy `sdkwork-birdcoder` and mint a token per deployment.** That keeps today's platform-assigned id working only on the deployment that assigned it: a local platform registers the same application under a new `app_<uuid>`, so the committed token fails there and the repository would need one credential per machine. Declaring the registered id keeps one committed credential valid on every deployment that provisions from this manifest.

## Consequences

`pnpm desktop:prod` and any other pinned production source launch start with the committed public application token, so app-api isolation works before interactive login and survives restarts. The launch still owns no private credential: a reusable operator-exported token keeps winning, and provisioning with operator credentials still runs first for staging and production. A stale private credential is replaced by the committed token and reported, so the "regenerate, then fail closed" path no longer leaves a launch with nothing.

The cost is that the manifest now names a registration-assigned identifier rather than a readable application key, so a deployment that already provisioned this application under another id must re-provision or update that row before the committed tokens resolve there.

## Verification

`packages/boot/sdkwork-env-bootstrap/tests/sdkwork-env-bootstrap.spec.ts` pins the pinned-production resolution, the no-expiry sentinel, the committed-token fallback, and the stale-credential replacement; `apps/desktop-host/tests/launch-environment.spec.ts` pins the online lane's launch environment. Against the deployed gateway, `POST /app/v3/api/auth/registrations` with each tracked production token answered `40001 username, email, or phone is required` — resolution succeeded — where the previous tokens answered `40103 invalid or expired IAM access token`.
