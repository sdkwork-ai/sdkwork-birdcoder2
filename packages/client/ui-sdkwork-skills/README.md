---
description: "Skill manager plugin: the Skills settings page listing every skill the Host composition serves — with or without a session — with per-skill enable switches, per-skill new-session-suggestion switches, detail inspection, and a durable ui-sdkwork-skills settings section the Host applies as real catalog suppression."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-skills

English | [中文](README.zh.md)

## Summary

The skill manager adds one page to the settings panel — 技能 (Skills), between Models and Plugins — and backs it with a durable preference the Host actually acts on. The page lists the catalog the current composition serves: the session's own view when a session is open, and the composition-wide inventory (bundled, preset, and user-level roots) when one is not. It groups rows by the same scenarios the new-session tag strip uses (code / media / document, everything else in one bucket), and gives every skill an enable switch, a suggestion switch, and a disclosure carrying the facts the catalog supplies. A disabled skill stops being a skill as far as the catalogs are concerned: the `/` menu no longer offers it and the model-facing catalog no longer advertises it, while the file on disk is never touched. The suggestion switch is the additive half of the strip's membership: it both removes a scene-table seat the user does not want and adds a seat for a skill the scene table never had, without the page needing to know which of the two it is doing.

## Table of Contents

- [Surface](#surface)
- [Configuration](#configuration)
  - [Why two strip lists rather than one](#why-two-strip-lists-rather-than-one)
- [How a disabled skill disappears](#how-a-disabled-skill-disappears)
  - [Session catalog vs composition-wide catalog](#session-catalog-vs-composition-wide-catalog)
- [Interaction with the new-session tag strip](#interaction-with-the-new-session-tag-strip)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Dev note](#dev-note)

## Surface

Three contributions, one per layer the feature has to cross:

- **The Skills page** — the browser half registers one `settings.section` (id `skills`, order 12, label from its own dictionary). The settings shell renders it in the content column and adds the nav row; the shell has no knowledge of what a skill is. The page renders catalog rows grouped by scenario, with a search box that matches the name, the description, the source label, the provider, and the localized alias, a per-group enable-all / disable-all, and five states it distinguishes honestly: preparing, loading, failed (with a retry), the composition-wide inventory (labelled as such), and no match.
- **The suppression provider** — the Host half registers a zero-ranked catalog provider named `sdkwork-skill-suppression` that re-advertises every disabled name with `modelInvocable: false` and `userInvocable: false`. See [How a disabled skill disappears](#how-a-disabled-skill-disappears).
- **The `skillPreferences` service** — the browser half projects the settings section into a cross-plugin read face (`getSnapshot` / `subscribe`). A feature plugin may not runtime-import another feature plugin's values, so this is the only way a consumer — the new-session tag strip — learns which skills the user took out of the suggestion row. Consumers reach it through `ctx.get('skillPreferences')` and tolerate its absence.

## Configuration

The plugin owns one settings namespace, `ui-sdkwork-skills`, registered by the Host half and bound by the browser half. All three fields are name lists:

| Field | Meaning |
|---|---|
| `disabledSkills` | Skills the Host suppresses from every catalog it serves. |
| `hiddenSceneTags` | Skills kept out of the new-session tag strip while staying fully available. |
| `pinnedSceneTags` | Skills added to the new-session tag strip while staying fully available. |

A name absent from all three lists is a skill the user never touched, so clearing a field — or the whole section — returns the composition default. The durable value lives in the Host user-settings document, which means the setting survives a restart and is per-user rather than per-project; the catalogs it filters are per-project.

### Why two strip lists rather than one

`hiddenSceneTags` and `pinnedSceneTags` express opposite directions, and the page writes whichever one matches the name's *scene default* rather than always writing the same field. The reason is that the scene table is a build-time product decision owned by `ui-sdkwork-app-modes`: it supplies a default seat for each of its skills, and a purely subtractive model could only ever take those seats away. A skill that has no scene-table seat — a `dsh-*` package, a preset `customSkillDirs` entry, a user-level skill — could never be suggested at all. Adding the second list turns membership into `sceneTable − hidden + pinned`, which is what lets every row on the page carry a working switch and not just the ones the scene table happened to pick.

The two lists are deliberately **not** constrained to be disjoint, and the store does not enforce that they are: an older document, a hand edit, or a race between two writes can put a name in both. When that happens **hide wins** — a name in `hiddenSceneTags` never renders a pill regardless of `pinnedSceneTags`. That precedence is computed in exactly one place (`skillPreferences`'s `hidden` set) and consumed per tag by the strip, so there is no second implementation to drift.

The page's switch is intentionally direction-neutral: it renders "shown / not shown" and passes its own scene-table membership down as the `sceneDefault` argument, which the write path uses to pick the field. Turning a scene-table skill back on therefore *clears* its `hiddenSceneTags` entry instead of adding a redundant pin, and turning a non-seat skill off *clears* its pin instead of adding a redundant hide. The stored section stays free of dead entries that way, and every write is a pure settings write — never a toggle of an inverted flag.

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

The suppression provider ranks 0, so it wins every same-name comparison without a single upstream file being patched. Its candidate carries an invocation policy that hides the name from both sides, and the two sides filter at their own boundary rather than the Host pre-filtering for them: the `/` menu handler filters on `isUserInvocable`, and the model-facing catalog filters on `modelInvocable`. That split is deliberate — it keeps `skills.list` a *neutral* inventory, so this page can list and switch everything, including skills only the model may invoke. Suppressing rather than deleting also means the skill file stays exactly where the user — or the repository — put it, and re-enabling is a pure settings write.

The provider reads the section on every `list()` call, so an answer is never stale; the registry caches completed catalogs, which is why a settings commit also invalidates through the provider registration's own control.

### Session catalog vs composition-wide catalog

`skills.list` is doubly addressed. Given a `sessionId` it answers with that session's own project-scoped catalog, exactly as before. Given `scope: 'all'` instead it answers with the composition-wide inventory: every root that does not depend on a working directory. The mechanism is the registry's own root selection — with no `cwd` the project roots are skipped while the custom, user-level, and bundled roots still mount — so the global view is not a second code path over a hand-built path list, it is the same registry answering a question it can already answer. This is what makes the page useful before a workspace is picked, and the page says which of the two it is showing rather than pretending the list is project-scoped.

## Interaction with the new-session tag strip

The strip below the composer (`ui-sdkwork-app-modes`) shows its scene's skills as suggestion pills. It subscribes to `skillPreferences` and applies both lists: names in `hiddenSceneTags` are dropped, names in `pinnedSceneTags` are appended, a name in both is hidden, and a scene whose whole strip is hidden renders nothing rather than an empty row. The two settings are deliberately different in force: the two tag lists only change what is *suggested*, while `disabledSkills` changes what *exists*. A deployment that does not compose this plugin shows every scene-table tag — the injection is optional, so the strip's own fiber never waits on it.

**Runtime invariant:** No companion is published. The suppression set is a pure projection of the named settings section — the provider re-reads it on every `list()` call — so the only state that can drift is the registry's completed-catalog cache, and a settings commit invalidates that through the registration's own control. A hand-edited settings document cannot break skill discovery either: a name that fails the registry's grammar is dropped before it becomes a candidate, and a field that is not a list reads as "nothing suppressed". Both properties are asserted by the Host spec instead of by a runtime companion.

## Known limitations and deferred work

- **`disabledSkills` is per-user, not per-project.** It applies to every project the same user opens. A per-project override would need the section to key by project root.
- **The composition-wide view is per-composition, not per-recent-project.** With no session the page shows the roots that do not depend on a workspace; it deliberately does not guess a cwd for a project the user has not opened.
- **Both catalog halves are per-user, and so is the strip.** `hiddenSceneTags` and `pinnedSceneTags` are one set for the whole user, not one per scene. A skill hidden while the Code scene is staged is hidden for the Media scene too.
- **A pin whose skill disappears still renders on the strip.** The strip appends pins from the preference list alone and does not verify them against a fetched catalog, so a pin left behind by a removed skill shows as a dead pill until it is cleared here. This page lists only names the Host actually serves, which is where the stale entry is visible and removable.
- **The model still sees the name in its prompt history.** A skill disabled mid-session disappears from the next catalog read, but a turn already composed with it is already composed.
- **No editing of the skill's own metadata.** Description, `whenToUse`, and the model/user invocation policy are owned by the skill file's frontmatter; the page shows them and never writes them.

## Dev note

`pnpm exec tsc -b packages/client/ui-sdkwork-skills/tsconfig.host.json` type-checks the Host half alone, and `pnpm exec tsc -b packages/client/ui-sdkwork-skills/tsconfig.client.json` the browser half; the package is split because the two faces merge cordis `Context` under the same keys, so no single program can see both. The repo-wide gates it participates in are `tsconfig.host.json` (Host half and its spec) and `tsconfig.client.tests.json` (browser half tests), plus `pnpm run verify-builtin-scene-skills`, which keeps the page's scene table and the composer's tag table in step with the packaged skills. The page's component spec drives the store directly, and the Host spec drives the provider against a real Cordis context with stand-in `settings` and `skills` services.

A note for whoever touches the Remote contract next: the page's `SkillCatalogSource` union and the Host's `SkillEntrySource` union are two spellings of the same closed vocabulary (`project` / `custom` / `user` / `bundled` / `runtime` / `unknown`), because the Host collapses the registry's open `source` string into that closed set at the `skills.list` boundary and the client store re-declares it to stay free of a Host type import. If a source class is ever added, both spellings and the `row.source.*` dictionary pair move together — the Host spec's source-mapping case is the one that will fail first.
