# SDKWORK_DEPLOY_SPEC — bundled contract

Authority: `sdkwork-specs/SDKWORK_DEPLOY_SPEC.md`. Distilled for portability;
the checkout text wins when available.

## Scope

This spec owns the repository's own host deployment file and its apply/rollback
procedure. It does **not** own the deploy platform's application/artifact/
release/deployment records; those live in
`APPLICATION_FACTORY_DEPLOYMENT_SPEC.md` §2–§3 (five concepts, `deploy_app`
status DRAFT → ACTIVE → PAUSED → ARCHIVED, durable stage state, forward-only
uninstall), `DEPLOYMENT_SPEC.md` §1.4 (development/release/deploy side-effect
boundaries) and `RELEASE_SPEC.md` §2.1/§4/§5 (immutable artifacts, per-target
evidence, rollback).

## Repository deploy file (§2, §6)

- Exactly one `deployments/deploy.yaml` per deployable repository, `version: 2`.
  There is no workspace-wide deploy manifest.
- `appId` equals the repository directory and `topology.spec.json` `appId`.
- `runtimeCode` equals `topology.applicationCode` (lowercase kebab-case); host
  paths never use `app.key`, `appId` or a database field.
- Installation is `binary-package` in production (`source-tree` is an exception
  with a dated record). Surfaces live under `apps/{appId}-{client-arch}/`; a web
  dist is `.../dist/`, a mini program `.../dist/weixin/`, adaptive web installs
  `<share>/web/{pc,h5}/`.

## Profiles and exposure (§6.1–§6.2, §7)

- Simple mode names one `profile`; multi-profile mode declares `profiles` and
  `defaultProfile` with no root profile fields. A dual-profile app declares both
  `standalone.production` and `cloud.production`.
- `expose[]` requires `domain`; optional `tls`, `mode` (web/api/web+api), `web`
  (adaptive/pc/h5/both), `aliases[]`, `apiPathStyle`. Live edge is
  `sdkwork-webserver`; never edit `/etc/nginx` directly.
- `packages[]` is the host package matrix (`flutter-mobile`, `harmony-mobile`,
  `android-mobile`, `ios-mobile`, `mini-program-*`, `desktop-*`), not the deploy
  platform's artifact forms.
- Overrides are exceptions with a reason; secrets only as `secret://` references.

## Apply and rollback evidence (§12, §13)

A side-effecting command requires: explicit profile, lifecycle environment,
immutable artifact id plus `sha256:<digest>`, an artifact evidence document
(artifact id, path, packaged-bytes digest, version, source commit, package id,
profile support, SBOM, provenance, signature), an approval reference, and a
rollback target or `forward-fix:<boundary>`. `defaultProfile` is never implicit.

Verification sequence: `plan → render → nginx -t → deploy → reload →
health-check → rollback previous config on failure`. Rollback restores the
validated backup, keeps the failed config for diagnosis, and reloads only when
approved; a first install is forward-fix only.

## Relationship to this skill's publish

The conversation publish uses the **deploy platform API** and its
application/artifact/release/deployment records. It is not this file's
apply/rollback procedure, and it never edits `deployments/deploy.yaml`. A host
deploy by this spec is a separate operation owned by the deployments console or
the repository's own pipeline.
