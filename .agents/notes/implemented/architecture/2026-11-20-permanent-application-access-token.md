# Agent Note: A packaged application access token is permanent and every application type carries one

Status: implemented

English | [中文](2026-11-20-permanent-application-access-token.zh.md)

## Problem

The public application access token is the only credential a client has before an interactive session exists: it resolves tenant, organization, application, environment, and deployment profile for credential-entry bootstrap. Three rules that the shipped token matrix did not actually satisfy:

- It shipped with an expiry. The generator stamped `exp` with `2100-01-01T00:00:00Z` and the standard called it a "far-future rotation deadline". A token baked into a packaged application cannot be renewed by that application, so the model invited a shipped build to die on a date nobody scheduled, and a concrete deadline could reach a package without any gate objecting.
- Coverage was per repository, not per application type. Five `apps/*` roots carried the matrix while the repository root's Web/Desktop deployment documents (`.env.<profile>`) did not, and only six of the ten profiles existed: a staging or demo build of the shell had no carrier at all. `.gitignore` even ignored the staging profiles, so a fresh checkout could not have them.
- The two isolation levels had no explicit statement of what they isolate. Tenant-level (`organization_id = 0`) and organization-level (non-zero) were mechanically supported, but the difference between "keyed by tenant" and "keyed by tenant + organization" was only implicit in the resolver, and the generator's default `exp` obscured that the level is a property of the installation, not of a request.

## Decision

A public application access token is **permanent by default** and **every application type carries one**.

`exp` is `0`, the canonical no-expiry sentinel. `sdkwork-specs`'s generator (`PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY`) and IAM's resolver (`APPLICATION_ACCESS_TOKEN_NO_EXPIRY`) agree on it, an absent claim means the same, and any concrete deadline is an opt-in rotation window that must be after the generation instant. `assertApplicationAccessToken` owns the lifetime decision: a permanent token always passes, an elapsed concrete deadline is rejected with the claim that expired, and every gate calls that one function instead of re-deriving the rule.

The matrix is per root. Every manifest-bearing root and the repository root that builds the Web/Desktop shell must carry all ten profiles, whatever its application type. The root's documented `.env.<profile>` documents are authored, so the materializer gains a `dotenv-root` format with `mode: "token-only"`: it rewrites exactly the `SDKWORK_ACCESS_TOKEN` line, keeps every other byte (docs, URLs, empty key placeholders), refuses a document whose declared identity names another profile, and `--check` compares that line alone. The repository declares that surface in `etc/client-env.materialization.json`, so the existing gates cover it with the same rules as the five `apps/*` surfaces.

The two levels are two isolation keys, stated in the standard: tenant-level keys rows by `tenant_id` with `organization_id = 0`; organization-level keys rows by `tenant_id` plus the installation's non-zero organization. The level is decided by the installation and the surface declaration, never by a request, and a client must not widen or re-scope a shipped token.

The level is declared once: `accessToken.organizationId` **is** the level (non-zero → `ORGANIZATION`, `0` → `TENANT`), so a surface does not repeat it as `accessToken.ownershipScope`; the explicit scope and the `SDKWORK_APPLICATION_OWNERSHIP_SCOPE` override still win but must agree with the binding, and `accessToken.scope` stays the explicit guard. A contradiction fails in resolution, before any token is built. The browser-side builder and the initializer follow the same rule: an explicit tenant level with a non-zero organization id fails instead of coercing it away, and the dialog clears the organization field when the operator switches back to tenant level. A multi-root initialization refuses to change a root's release level: a tenant-level request cannot overwrite an organization-bound surface, and an organization request must name that root's own organization.

The server projects the same keys. When IAM resolves a public application token — or issues the standalone bootstrap credential of a packaged deployment — it sets `data_scope` to `tenant:<tenant_id>`, plus `organization:<organization_id>` for an organization-level release and `user:<owner_user_id>` for a `USER` release. A tenant-level credential never carries an organization key. That matches session credentials, so a data plane filtering by `data_scope` isolates an organization credential to its organization, while `IamShardingContext` routes it to the organization partition (`DATABASE_SPEC.md` §16).

A surface declaration is also checked against its root's `agent.app.config.json`: `tenantId` must equal `backend.tenantId`, and a manifest that names a non-zero `backend.organizationId` forbids shipping a token outside that organization. The materialization declaration remains the authoritative inventory of a repository's client application types — a server-only or non-client root (`format: "none"`) is outside the matrix — so the gates enforce every declared surface, its matrix, and its manifest agreement instead of guessing undeclared roots.

## Alternatives considered

**Keep the `2100-01-01` rotation ceiling.** It is effectively permanent for any real deployment and needs no consumer change. Rejected because "effectively" is exactly the ambiguity that produced the defect: the standard said expiry existed, so an operator could set a real deadline, and nothing distinguished a legitimate rotation window from an accidental one. The explicit `0` sentinel has one meaning and IAM already implements it.

**Omit `exp` entirely.** The cleanest JWT reading of "never expires", and the gates accept it. Rejected as the generator's default because some strict validators require the claim to exist; keeping `exp` present with the documented sentinel is both unambiguous and compatible, while an absent claim stays accepted for tokens already committed elsewhere.

**Refresh a short-lived token at startup.** It would keep the isolation credential out of long-lived packages. Rejected because the token must work before login and offline: there is no session and often no network at first paint, and a refresh path would make the pre-login route depend on the very credential channel it is supposed to bootstrap.

**Fully generate the root `.env.<profile>` documents.** It would remove the token-only special case. Rejected because those documents carry hand-authored deployment documentation, product-key placeholders, and launch-environment notes that a generated file would erase; owning one line is the smaller, reviewable contract.

## Consequences

- The committed matrix now carries `ownership_scope` and `exp: 0`; the 60 profile files (six surfaces × ten profiles) are stale-free and `materialize-client-env --check` passes.
- A packaged build keeps working with no scheduled renewal; rotation is an explicit `token_version`/`issuedAt` change or a deliberate, gated rotation window.
- The root surface is now verified by `check-app-access-token-env.mjs` and `check-release-access-token-env.mjs`, and the four missing profiles (staging/demo, standalone/cloud) exist, so `staging` and `demo` shell builds have a carrier.
- `readTokenTimestamps` no longer records `1970-01-01` as the expiry of a permanent token.
- A deployment must still inject its own deploy application id; the committed placeholder (`__SDKWORK_DEPLOY_APPLICATION_ID__`) is materialized at packaging time, and a source checkout fails `--require-anchor` by design.
- An organization-level release is declarable with one field (`accessToken.organizationId`) and both gates verify the derived `ORGANIZATION` expectation; a scope or override that contradicts the binding fails before generation.
- A declaration that drifts from its root manifest (another tenant, or a token outside an organization-bound application) fails materialization and both gates instead of producing an isolation context the application does not own.
- The organization projection is covered by the DB-backed ownership test: it resolves tenant, organization, and personal tokens and asserts the persisted data scope carries `organization:<id>` only for the organization release, for both public-token resolution and bootstrap issuance.
- A shared-release bootstrap credential is served by a tenant-scoped synthetic principal (`system:<tenant_id>`) instead of one global `system` user: the global `iam_user.id` primary key otherwise let only the first tenant on a database ever issue a standalone bootstrap credential.
- Runtime mutations that previously matched only a row id now bind `tenant_id` as well: password credential/user updates, session revoke, refresh-session revoke and rotation, scope refresh, service-account session revoke, API-key last-used, and provider-credential read-back. Opaque-token and ephemeral-key lookups stay global by design because the presented secret is the only selector; they are the documented cross-tenant exception of `DATABASE_SPEC.md` §16.
- A repository whose root profiles are absent now fails the gate instead of quietly shipping an empty credential, so an application type cannot be added without its carrier.

## Testing

`pnpm run check:database` in `sdkwork-iam` runs the repository-local SQL scope gate: `database/contract/sql-scope.json` classifies every tenant-owned table and inventories each reviewed cross-tenant exception, and `scripts/check-sql-tenant-scope.mjs` fails any read, insert, update, or delete that ignores the class. The workspace gate (`check-tenant-isolation-sql.mjs`) remains the fleet-wide check for optional scope predicates.

The level distinction is pinned where it can regress: a mixed-level repository fixture materializes and verifies a tenant surface and an organization surface side by side, the gate tests swap a tenant token onto an organization surface (and the reverse, and a foreign organization), the DB ownership test asserts that a tenant token cannot resolve an organization installation or another organization's installation, the IAM resolver test asserts that an installation accepts only claims of its own level and organization, the isolation-key test asserts that only the tenant level is shared and forces the organization sentinel, and the DB bootstrap test issues credentials for two tenants and requires two independent tenant-scoped principals.
