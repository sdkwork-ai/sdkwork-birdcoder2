# Agent Note: Persona role and interest personalization

Status: implemented

English | [中文](2026-11-01-persona-role-and-interest-personalization.zh.md)

## Problem

The fork's "千人千面" requirement asks the app to know who is using it — 学员, 员工, 老师, 合作伙伴, and so on — plus which directions that person follows, so recommendation surfaces can shape the default experience. Before this change the client had no role model at all: the desktop onboarding asked one work-purpose question (`office`/`development`) inside the account flow, nothing persisted a role or an interest list, and no surface let a person change either. The backend had no business-role definitions either, so a grant flow had nothing to reference.

Two constraints shaped the design. The durable store has to be a settings section the Host already serves per user, or the choice lives in page memory and disappears. And the settings menu's popover is assembled once at apply, so whatever feeds its rows must be independent of plugin activation order.

## Decision

Superseded in part by [Persona profile on the IAM account](2026-11-02-persona-account-profile.md): the durable store moved from the Host settings section to the IAM account profile, while the picker gate, the atomic write, and the settings-menu seam documented below still ship.

`packages/client/ui-sdkwork-persona` (`@deepseek-ai/dsh-client-ui-sdkwork-persona`) owns personalization. Its Host half declares the durable `ui-sdkwork-persona` section — `role` (closed union of the eight persona ids), `interests` (interest ids), `promptDismissed` — as volatile fields so the browser scope can read and write them. Its browser half binds `ctx.configForms`, provides no service of its own, hosts the picker on `shell.overlay`, and does three things: it projects the current choices into the settings-menu persona seam, it runs a one-shot first-run gate, and it serves the picker state through a declared store.

The gate opens once when the section is ready and writable, no role is chosen, and the prompt was not dismissed. Closing without a role writes `promptDismissed`, so a dismissal is durable; a failed write leaves the prompt owed, which is the honest state. Saving writes role and interests in one atomic namespace mutation, and the dialog keeps the draft open when the Host refuses or the transport fails.

The settings menu gained `PersonaRuntime` on `ctx.persona` — an unavailable default plus `setSource`, mirroring the account and feedback seams — and a `角色与兴趣` row that renders only while a source reports available, labeled with that source's localized role name. The persona plugin installs its source through `setSource` and receives a disposer that restores the default, so a reloaded menu never keeps a dead source. Consumers that need the choices read the section through `ctx.configForms.get('ui-sdkwork-persona')`; the package exports no picker store.

On the IAM side the eight immutable platform roles stay untouched. Nine industry and business roles — `course_learner`, `course_instructor`, `course_assistant`, `course_reviewer`, `apps_employee`, `apps_partner`, `apps_guest`, `ops_support_agent`, `ops_content_moderator` — are declared as `roles.domainStandardRoles` in the `courses`, `apps`, and `ops` module manifests. `database/seeds/common/004_iam_role_catalog_seed.sql` seeds the complete enabled-module catalog (eight platform roles plus fifteen domain roles) for tenant `100001` with ids identical to the materializer's, and the zh-CN locale overlay carries their display names.

## Alternatives considered

**Let the persona plugin provide `ctx.persona` and have the menu read it.** Lost to activation order: the settings menu builds its injected face once at apply, so `ctx.get('persona')` would return undefined for every composition where the persona row activates later, and the row would silently vanish. The seam keeps the menu's face complete with or without the feature.

**Store the choices on the IAM account profile.** Lost on current evidence: the settings document is per Host profile and is already served, while an account-scoped store needs a backend profile field and a migration. The limitation is documented instead of half-built. (Later reversed: the account profile shipped in the linked note.)

**Keep the cross-module `messaging.*` reads in `course_assistant`.** Removed before shipping: the role sits in the `courses` manifest, and `IAM_MODULE_MANIFEST_SPEC` permits cross-module grants only with a declared dependency and governance approval. The role stays read-only inside its own domain.

**Ride the existing blank-session onboarding coordinator.** Lost because that coordinator mounts only while a blank session is current, so a startup that resumes an existing session would never prompt.

## Consequences

The picker opens once for every existing user on the next launch; the web e2e scaffold answers it in its fixture deployment layer so unrelated scenarios do not start behind a modal. Choices now live on the IAM account (see the linked note); the Host section is the offline and signed-out cache. No backend grant happens: the role mapping is documentation plus the IAM catalog. On a packaged desktop first run the picker paints above the account onboarding because it registers later; the two first-run surfaces are not sequenced yet.

## Testing

`packages/client/ui-sdkwork-persona/tests` covers the Host section, the settings-menu seam (install, project, restore), the first-run latch, the atomic write, and the picker's behavior, at per-file 100% coverage. The settings-menu specs cover the new row and the runtime's source lifetime. The IAM side was verified with the module-manifest validator and the database framework and contract-alignment checks.
