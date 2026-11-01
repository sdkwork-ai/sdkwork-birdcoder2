---
description: "Persona personalization for BirdCoder: the role and interest profile stored on the SDKWork IAM account, the first-run picker, the settings-menu row, and the local cache used while signed out."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-persona

English | [中文](README.zh.md)

## Summary

Persona personalization for BirdCoder. The role, the followed interest directions, the first-run answer, and the selectable taxonomy are stored on the signed-in SDKWork IAM account and read through `ctx.iam`, so a choice follows the person across devices and surfaces. This package hosts the picker on `shell.overlay`, binds the settings-menu `角色与兴趣` row, and keeps the local `ui-sdkwork-persona` section as the offline and signed-out cache.

## Table of Contents

- [Storage and Behavior](#storage-and-behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Storage and Behavior

The account profile is the authority: `GET`/`PUT`/`DELETE /app/v3/api/iam/users/current/persona`, exposed through `ctx.iam`. The account also owns the taxonomy: the picker narrows its role and direction lists to the ids `persona_catalog` returns, so disabling one server-side removes it without a client release (a chosen role the catalog drops counts as unchosen and re-opens onboarding), while an unreadable catalog falls back to the built-in list. The first-run gate opens once per account while no role is chosen and the prompt was not answered, so answering on one device keeps every other device quiet; on a configured IAM it first waits for the stored session to restore, so a device whose account already holds a role is not interrupted. Saving writes the role and the interest list in one request; a rejected account write is reported to the dialog and nothing is cached as if it had been saved. A cache-only choice or dismissal (made while signed out, or before the profile moved onto the account) is uploaded once on the next signed-in start, because the account reporting no selection while the cache holds one is the migration case.

Role ids are presentation ids (`learner`, `employee`, `teacher`, `partner`, `manager`, `developer`, `creator`, `visitor`). The IAM catalog maps the roles that have an authorization counterpart onto the seeded business roles (`course_learner`, `apps_employee`, `course_instructor`, `apps_partner`, `ops_content_moderator`, `apps_guest`); `manager` and `developer` have no mapping and stay presentation-only. This package records the choice and never grants a backend role.

## Model Experience

None, as the plugin stores an account profile choice and renders client chrome without adding a session event, tool, prompt section, or model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- The picker renders locale-owned copy for the role and interest ids this build knows. The account catalog filters and orders the list, and an id this build does not know is dropped on read instead of rendered unlabeled, so adding a brand-new id still needs a client release while disabling an existing one needs none.
- Recommendation surfaces do not consume the account profile yet. They read it through the IAM App SDK; the picker only records the choice.
- No backend call grants the mapped IAM business role. The role catalog in `sdkwork-iam` seeds the definitions, and a future grant flow can use the mapping above.
- On the first launch of the packaged desktop app the account onboarding and this picker are both first-run surfaces, and the picker registers later, so it paints above that onboarding. Answering or dismissing one reveals the other; the two are not sequenced yet.
- A signed-out local session keeps the choice in the Host settings cache only. It reaches the account on the next signed-in start, and two signed-out profiles on one machine do not share it.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The plugin owns no service on `ctx`: the picker dispatch rides the settings-menu `ctx.persona` seam, which the settings menu provides as an unavailable default so its injected face is independent of activation order. The feature plugin installs its source through `setSource` and receives a disposer that restores the default, which is what keeps an HMR reload from leaving the menu on a dead source.

`PersonaService` takes the account port and the cache scope as two collaborators. Reads prefer the freshest account snapshot and fall back to the cache; writes go to the account when it is available and to the cache otherwise; `service.start()` installs both subscriptions and is owned by one `ctx.effect`, so a reload leaves no orphaned listener. The account sync reads the persona and the catalog together, invalidates an in-flight read when the account changes, and retries a failed read when the picker opens. The account port is built in `apply` over `ctx.iam`, which owns the generated IAM App SDK client, the base URL, and the shared token manager — the persona package never builds a second transport.

</details>
