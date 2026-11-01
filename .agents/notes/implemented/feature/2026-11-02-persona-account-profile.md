# Agent Note: Persona profile on the IAM account

Status: implemented

English | [中文](2026-11-02-persona-account-profile.zh.md)

## Problem

[The first persona implementation](2026-11-01-persona-role-and-interest-personalization.md) stored the role, the followed interest directions, and the first-run answer in the Host `ui-sdkwork-persona` user-settings section. That section belongs to the Host profile, not to the SDKWork IAM account, so two IAM accounts signing in on one machine shared one persona and a second device started empty. Recommendation surfaces also had no stable place to read the choice.

The product needs an account-scoped profile that every client architecture can read through one API, with a selectable taxonomy the service owns instead of each app hard-coding.

## Decision

The persona profile is owned by `sdkwork-iam`:

- **Storage.** `iam_user_persona` holds one row per `(tenant_id, user_id)` — a nullable `role_code`, a JSON array of interest codes, `prompt_dismissed`, and the catalog version the selection was validated against. The selectable taxonomy lives in `iam_persona_role` and `iam_persona_interest`. Catalog rows are platform-owned (`owner_tenant_id = '0'`, the `iam_oauth_provider_catalog` precedent), so no seed pins a tenant literal and every tenant reads one taxonomy; a tenant-owned row for a code overrides the platform row. Labels are locale maps in `label_i18n` / `description_i18n`, written by one seed file per locale.
- **Authorization boundary.** A persona role may map onto the authorization role catalog through `iam_persona_role.iam_role_code`, but selecting a persona never grants a permission and no persona role becomes a grantable `iam_role` row. `manager` and `developer` have no mapping and stay presentation-only.
- **API.** `GET /app/v3/api/iam/persona_catalog`, and `GET` / `PUT` / `DELETE /app/v3/api/iam/users/current/persona`. `PUT` is a full replace validated against the active catalog (unknown role or interest codes are rejected, interests are de-duplicated and stored in catalog order). A person who never chose reads an empty persona, not 404. The OpenAPI document is materialized from the route manifest and the TypeScript App SDK is generated from it; other languages regenerate from the same authority when needed.
- **Database initialization.** `database/migrations/postgres/0021_iam_user_persona.up.sql` creates the three tables (the baseline stays historical). `seeds/common/005_iam_persona_catalog_seed.sql` seeds eight roles and twelve interests; `seeds/locales/zh-CN/002_iam_persona_labels.sql` and `seeds/locales/en-US/001_iam_persona_labels.sql` merge one locale each into the same rows, because a seed file must not mix locales.
- **Client.** `ui-sdkwork-iam` exposes `retrievePersona`, `updatePersona`, and `retrievePersonaCatalog` on `ctx.iam` over the generated client it already owns, so the base URL and token manager stay single-sourced. `ui-sdkwork-persona` builds an account port over that face: reads prefer the freshest account snapshot, fall back to the Host cache, and upload a cache-only choice once when the account reports none — the migration case. Writes go to the account when available; a rejected write is reported to the dialog instead of being recorded as saved. The same port carries the catalog, and the picker renders only the ids it allows. The Host section remains the offline and signed-out cache.

## Alternatives considered

**Keep the choice in the Host settings section.** Lost: it is per Host profile, which is exactly the limitation the requirement removes.

**Add a dedicated personalization service.** Lost on current evidence: one consumer exists, and a new service would duplicate the identity, tenant scoping, seed, and SDK infrastructure IAM already provides.

**Store the persona as an `iam_role` grant.** Lost: an onboarding answer would become an authorization decision, and the backend user-directory role lists would show pseudo-roles that must never be granted.

**Extend the existing `settings` preference store.** Lost: settings owns generic application preferences, but the persona taxonomy, its validation, and its account predicate are identity-scoped data; putting them there would split one profile across two services.

## Consequences

The choice follows the account across devices and client surfaces, and every SDK consumer reads the same taxonomy. The Host settings section changes from authority to cache, and a signed-out local session keeps working but reaches the account only on the next signed-in start.

Catalog changes are data: adding a role or interest requires a seed row and both locale files, not a client release — except that the picker renders locale-owned copy, so an entirely new id still needs client copy and is dropped on read until then. The picker narrows to the account catalog, so disabling an existing id needs no release and a chosen role the catalog drops counts as unchosen. On a configured IAM the first-run gate waits briefly for the stored session to restore, so a device whose account already holds a role is not prompted. The desktop first-run ordering between account onboarding and this picker is unchanged.

## Testing

`sdkwork-iam` verifies the database contract with `node tests/contract/iam-database-contract-alignment.test.mjs` and `check-database-framework-standard.mjs` (both cover the three new tables in all five registry locations), and the OpenAPI/SDK step is exercised by `node tools/generators/materialize-iam-v3-openapi-boundaries.mjs` followed by `node sdks/sdkwork-iam-app-sdk/bin/generate-sdk.mjs typescript` plus the generated project's `publish-core` check. `packages/client/ui-sdkwork-persona/tests` covers the account read, the account write, the rejected write, the cache mirror, the one-time migration, the signed-out cache path, the first-run gate, and the settings-menu seam; `packages/client/ui-sdkwork-iam/tests` covers the runtime and service the persona methods extend.
