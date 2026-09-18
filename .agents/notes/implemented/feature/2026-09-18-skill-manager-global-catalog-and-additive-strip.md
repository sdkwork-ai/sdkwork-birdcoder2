# Agent Note: Skill manager: composition-wide catalog and additive strip membership

Status: implemented

English | [中文](2026-09-18-skill-manager-global-catalog-and-additive-strip.zh.md)

## Problem

The Skills settings page and the new-session tag strip were built on one shared assumption — that the catalog is a *session's* catalog — and that assumption turned out to cost the feature most of what it was for.

Two failures followed from it. The page could not open before a workspace was picked: the Host resolved the catalog from the session's project root, so a reader who wanted to see what skills the product ships had to create a session first, and the page said so in a notice rather than showing anything. More seriously, the page could only *subtract* from the strip. The strip's membership came from a build-time scene table owned by `ui-sdkwork-app-modes`, and the page exposed a single `hiddenSceneTags` list, so the 13 `dsh-*` packages, the preset `customSkillDirs` entries, and every user-level skill had no switch that did anything — a reader looking at a row for a skill the scene table never picked saw a control that could only ever be off. A settings page that lists a skill and then offers no way to suggest it is not a manager; it is a viewer with dead controls.

Under both failures was a third, quieter one: the Host pre-filtered the catalog with `isUserInvocable` before answering, so `skills.list` was never a neutral inventory. Every consumer inherited the assumption that the only interesting skills are the ones a user can type.

## Decision

Three changes, each one removing one of those assumptions.

### The catalog is doubly addressed

`skills.list` accepts either a `sessionId` or `scope: 'all'`. With a `sessionId` it answers the session's project-scoped catalog exactly as before. With `scope: 'all'` it answers the **composition-wide inventory**: every root that does not depend on a working directory.

The mechanism is the registry's own root selection, not a second code path. `skillFilesystem.roots(cwd)` mounts the project roots only when `includeDefaultRoots` is set *and* `cwd` is defined; with no `cwd` the custom, user-level, and bundled roots still mount. So the global view asks the same registry a question it could already answer, and the page never invents a cwd to get an answer it wants. `SkillEntry` gained `source` and `provider` so the page can say where a row came from rather than leaving the reader to guess; the Host collapses the registry's open `source` string into a closed `SkillEntrySource` vocabulary (`project` / `custom` / `user` / `bundled` / `runtime` / `unknown`) at that boundary.

### The catalog is a neutral inventory

The `.filter(isUserInvocable)` moved off the Host and onto the consuming boundary. `skills.list` now returns model-only skills too, and each consumer filters what it may offer: the `/` menu and the reference resolver in `ui-skill` filter on `userInvocable`, and the model-facing catalog filters on `modelInvocable` as it always did. The page therefore lists and switches everything, which is what a manager page is for.

### Strip membership is additive, and the user owns the delta

A third preference field, `pinnedSceneTags`, joins `disabledSkills` and `hiddenSceneTags` in the `ui-sdkwork-skills` section. Membership becomes `sceneTable − hidden + pinned` instead of `sceneTable − hidden`.

The scene table stays exactly what it was: a build-time product decision supplying default seats. The overlay is set arithmetic on top of it, never a replacement — a pinned skill gains a pill but does not stage a scene, and a hidden skill stays fully available from the `/` menu. The page's switch is deliberately direction-neutral ("shown / not shown"): it passes its own scene-table membership down as the `sceneDefault` argument, and the write path picks the field that matches. Turning a scene-table skill back on therefore *clears* its `hiddenSceneTags` entry rather than adding a redundant pin, so the stored section never accumulates dead entries and every write is a pure settings write rather than a toggle of an inverted flag.

The two lists are deliberately **not** constrained to be disjoint and the store does not enforce that they are: an older document, a hand edit, or two racing writes can put a name in both. **Hide wins.** That precedence is computed in exactly one place — the `hidden` set the `skillPreferences` service publishes — and consumed per tag by the strip, so there is no second implementation to drift.

### The strip's name grammar is the public skill grammar

The token matcher was `/\/birdcoder-[a-z0-9-]+ ?/g`, which hard-coded the fork's own package prefix. Pinning a `dsh-*`, preset, or user-level skill would have rendered a pill whose label was right and whose click landed nowhere, because the replace-mode write would not recognise its own token. It is now the open Agent Skills grammar, `/\/[a-z0-9]+(?:-[a-z0-9]+)* ?/`, plus a trailing-partial matcher so an in-progress token is still replaced rather than duplicated. Appended pins label themselves `/<skill>` from the skill's own name, so the strip needs no localized alias for a skill it was not built with.

## Alternatives considered

**Give `skills.list` a `cwd` argument and let the page pass the workspace root.** This is what the old limitation's wording implied, and it fails on the case that matters: before a workspace is picked there *is* no cwd to pass, so the page would still be empty at the moment a new user most wants to browse. It also would have made the client responsible for choosing a root, which is a Host composition fact.

**Keep the Host filtering on `isUserInvocable` and add a separate model-only listing call.** Two calls with two shapes means two caches, two failure paths, and a page that has to merge them — and the merge is exactly the place a source or provider mismatch would hide. Moving the filter to the boundary keeps one call and one shape, and each consumer's filter is one line at the point where the policy actually means something.

**Make `pinnedSceneTags` the primary field and derive `hiddenSceneTags` from it, keeping one list.** A single list cannot express "this scene-table seat is off" and "this non-seat is on" at once, because the two are relative to different defaults. Collapsing them would force either writing every scene-table name into the document to mean "unchanged", or losing the ability to turn a scene seat off.

**Enforce disjointness between the two lists — have a write always remove the name from the other list.** It reads tidier, but it puts a two-write sequence where one write used to be, so a failure between them leaves the document in the state the invariant was supposed to prevent, and it makes the outcome depend on write order under a race. Defining "hide wins" costs one `Set` and has no partial state.

**Keep the `birdcoder-` token prefix and special-case pinned labels.** The prefix was a real invariant once, but it was the *scene table's* invariant, not the strip's: the strip only ever needed to recognise the token it had itself written. Tying the matcher to the table's package prefix made pins structurally impossible; the public grammar is what the strip actually consumes.

## Consequences

The page is useful from a cold start and its switch works on every row it renders, which was the point. The cost is that catalogue reads now have two addressing modes and every consumer of `skills.list` must filter on the axis it cares about — the filter moved, it did not disappear, and `ui-skill` was a second consumer this change had to find and update (its 11 failing cases were the first evidence that the Host-side filter had been load-bearing).

`SkillCatalogSource` in the client store and `SkillEntrySource` in the Host are two spellings of the same closed vocabulary, because the client must not import a Host type. That duplication is deliberate but it is a real coupling: adding a source class means moving both spellings and the `row.source.*` dictionary pair together, and the Host spec's source-mapping case is the one that fails first. The alternative — the client importing the Host union — trades a five-line duplication for a package-graph edge that does not currently exist.

`scope: 'all'` is per-composition, not per-recent-project: it shows what does not depend on a workspace rather than guessing a cwd for a project the user has not opened. A reader who wants a specific project's skills still opens it.

A pin whose skill disappears still renders. The strip appends pins from the preference list alone and does not verify them against a fetched catalog, so a removed skill leaves a dead pill until the user clears it on the page. The alternative was a catalog fetch inside the strip's render path, which would put a Remote call and a failure state under a suggestion row; the page is where stale entries are visible and removable, so it is where they get removed.

## Testing

- `packages/api/session-controller/tests/session-skills.host.spec.ts` — the dual addressing (`scope: 'all'` vs `sessionId`), the source mapping into the closed vocabulary, the absent-registry failure, and, as deliberate shipped behavior, that a model-only skill is present in the listing.
- `packages/client/ui-sdkwork-skills/tests/skills-section.client.spec.tsx` — every row carries a working suggestion switch including non-scene-table rows, the direction-neutral switch writes the field matching its default, and the five catalog states.
- `packages/client/ui-sdkwork-skills/tests/skill-preferences.client.spec.ts` — the `hidden` set is published with the snapshot so precedence is not re-derived downstream.
- `packages/client/ui-sdkwork-app-modes/tests/scene-skill-tags.client.spec.tsx` — pinned skills render, hide beats pin, and the widened token grammar round-trips a non-`birdcoder-` name.
- `packages/client/ui-skill/tests/browser-plugin.client.spec.ts` — the boundary filter: a model-only skill is absent from the `/` menu candidates and the reference lexicon.

## Related

- [Hero scene switcher and document mode](2026-09-08-sdkwork-hero-scene-switcher-and-document-mode.md) — owns the scene table this change overlays; the table's decision is unchanged, so this note extends rather than supersedes it.
- [Repository naming contract and rename ledger](../../archived/architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md) — the `sdkwork` marker on every package this note touches.
