---
description: "Skill manager plugin: the Skills settings page listing every skill the session's composition serves, with per-skill enable switches, detail inspection, and a durable ui-sdkwork-skills settings section the Host applies as real catalog suppression."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-skills

English | [中文](README.zh.md)

## Summary

The skill manager adds one page to the settings panel — 技能 (Skills), between Models and Plugins — and backs it with a durable preference the Host actually acts on. The page lists the catalog the current session's composition serves, groups it by the same scenarios the new-session tag strip uses (code / media / document, everything else in one bucket), and gives every skill an enable switch, a disclosure carrying the facts the catalog supplies, and — for a built-in that owns a seat on the strip — a suggestion switch. A disabled skill stops being a skill as far as the catalogs are concerned: the `/` menu no longer offers it and the model-facing catalog no longer advertises it, while the file on disk is never touched.

## Table of Contents

- [Surface](#surface)
- [Configuration](#configuration)
- [How a disabled skill disappears](#how-a-disabled-skill-disappears)
- [Interaction with the new-session tag strip](#interaction-with-the-new-session-tag-strip)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev note](#dev-note)

## Surface

Three contributions, one per layer the feature has to cross:

- **The Skills page** — the browser half registers one `settings.section` (id `skills`, order 12, label from its own dictionary). The settings shell renders it in the content column and adds the nav row; the shell has no knowledge of what a skill is. The page renders catalog rows grouped by scenario, with a search box that matches the name, the description, and the localized alias, a per-group enable-all / disable-all, and four states it distinguishes honestly: no session, loading, failed (with a retry), and no match.
- **The suppression provider** — the Host half registers a zero-ranked catalog provider named `sdkwork-skill-suppression` that re-advertises every disabled name with `modelInvocable: false` and `userInvocable: false`. See [How a disabled skill disappears](#how-a-disabled-skill-disappears).
- **The `skillPreferences` service** — the browser half projects the settings section into a cross-plugin read face (`getSnapshot` / `subscribe`). A feature plugin may not runtime-import another feature plugin's values, so this is the only way a consumer — the new-session tag strip — learns which skills the user took out of the suggestion row. Consumers reach it through `ctx.get('skillPreferences')` and tolerate its absence.

## Configuration

The plugin owns one settings namespace, `ui-sdkwork-skills`, registered by the Host half and bound by the browser half. Both fields are name lists:

| Field | Meaning |
|---|---|
| `disabledSkills` | Skills the Host suppresses from every catalog it serves. |
| `hiddenSceneTags` | Skills kept out of the new-session tag strip while staying fully available. |

A name absent from both lists is a skill the user never touched, so clearing a field — or the whole section — returns the composition default. The durable value lives in the Host user-settings document, which means the setting survives a restart and is per-user rather than per-project; the catalog it filters is per-project.

## How a disabled skill disappears

The suppression is a provider, not a filter, because a filter would have to live at each consumer. The registry merges candidates per layer and a candidate's `rank` decides same-name winners inside a layer:

| Rank | Root |
|---|---|
| 100 | project `.dsh/skills` |
| 200 | project `.agents/skills` (every BirdCoder built-in) |
| 250 | runtime registrations |
| 300 | custom directories |
| 400 / 500 | user-level roots |
| 600 | the bundled root |

The suppression provider ranks 0, so it wins every same-name comparison without a single upstream file being patched. Its candidate carries an invocation policy that hides the name from both sides: the `/` menu handler filters on `isUserInvocable`, and the model-facing catalog filters on `modelInvocable`. Suppressing rather than deleting also means the skill file stays exactly where the user — or the repository — put it, and re-enabling is a pure settings write.

The provider reads the section on every `list()` call, so an answer is never stale; the registry caches completed catalogs, which is why a settings commit also invalidates through the provider registration's own control.

## Interaction with the new-session tag strip

The strip below the composer (`ui-sdkwork-app-modes`) shows its scene's skills as suggestion pills. It subscribes to `skillPreferences` and drops the names in `hiddenSceneTags`; a scene whose whole strip is hidden renders nothing rather than an empty row. The two settings are deliberately different in force: `hiddenSceneTags` only changes what is *suggested*, while `disabledSkills` changes what *exists*. A deployment that does not compose this plugin shows every tag — the injection is optional, so the strip's own fiber never waits on it.

**Runtime invariant:** No companion is published. The suppression set is a pure projection of the named settings section — the provider re-reads it on every `list()` call — so the only state that can drift is the registry's completed-catalog cache, and a settings commit invalidates that through the registration's own control. A hand-edited settings document cannot break skill discovery either: a name that fails the registry's grammar is dropped before it becomes a candidate, and a field that is not a list reads as "nothing suppressed". Both properties are asserted by the Host spec instead of by a runtime companion.

## Known limitations and deferred work

- **No session, no catalog.** The Host resolves the catalog from the session's project root, so the page needs a current session. Opened before a workspace is picked, it states that dependency instead of inventing a cwd; it does not show a global or recently-used catalog.
- **Per-user, not per-project.** `disabledSkills` applies to every project the same user opens. A per-project override would need the section to key by project root.
- **The model still sees the name in its prompt history.** A skill disabled mid-session disappears from the next catalog read, but a turn already composed with it is already composed.
- **No editing of the skill's own metadata.** Description, `whenToUse`, and the model/user invocation policy are owned by the skill file's frontmatter; the page shows them and never writes them.

## Dev note

`pnpm exec tsc -b packages/client/ui-sdkwork-skills/tsconfig.host.json` type-checks the Host half alone, and `pnpm exec tsc -b packages/client/ui-sdkwork-skills/tsconfig.client.json` the browser half; the package is split because the two faces merge cordis `Context` under the same keys, so no single program can see both. The repo-wide gates it participates in are `tsconfig.host.json` (Host half and its spec) and `tsconfig.client.tests.json` (browser half tests), plus `pnpm run verify-builtin-scene-skills`, which keeps the page's scene table and the composer's tag table in step with the packaged skills. The page's component spec drives the store directly, and the Host spec drives the provider against a real Cordis context with stand-in `settings` and `skills` services.
