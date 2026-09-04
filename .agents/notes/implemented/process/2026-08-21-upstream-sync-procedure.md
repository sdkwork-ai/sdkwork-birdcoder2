# Agent Note: Upstream sync procedure for the SDKWork fork

Status: implemented

English | [中文](2026-08-21-upstream-sync-procedure.zh.md)

## Problem

`main` is a fork of `deepseek-ai/deepseek-harness` that keeps merging upstream while carrying SDKWork-specific functionality. A sync that overwrites fork features, squashes upstream history, or resolves conflicts in the wrong direction destroys either the open-source lineage or the product. The first full sync (2026-08-21, upstream `528c682e06`) established the working procedure; this note records it so every later sync follows the same steps and the same conflict rules.

## Procedure

1. **Checkpoint any in-progress work first.** Uncommitted staged/unstaged changes (a previous SDKWork sync, renames, docs) must be preserved: commit them onto a `wip/<topic>-<date>` branch with `--no-verify` (the WIP state does not pass hygiene gates by definition), then reset `main` clean. Never merge on top of a dirty tree — git will refuse or half-merge.
2. **Fetch and merge with real history.** `git fetch upstream && git merge upstream/master` creates a merge commit that carries upstream's commits and messages verbatim. Never squash, rebase-flatten, or cherry-pick upstream onto main: the fork's merge history is what keeps future diffs small and the open-source lineage intact.
3. **Resolve conflicts fork-first.** The rules that keep the product intact:
   - SDKWork-only files (no upstream counterpart): keep our version wholesale.
   - Upstream-only files: take upstream's version wholesale.
   - Files both sides changed: merge both behaviors. Version-only `package.json` conflicts take upstream's version line (the fork does not publish `@deepseek-ai/dsh-*`, and upstream's line keeps the next sync small). Generated catalogs/docs take upstream's version, then regenerate.
   - When upstream changed a service interface the fork implements (for example `webServer.renderIndex`), implement the new interface in the fork code — do not revert the interface.
4. **Adapt upstream structure to the fork's branch and product.** Upstream's `master`-named CI artifacts (`ci-master.yml`, `refs/heads/master`) become `main`. Upstream release-workflow splits (pack vs publish) apply, with fork tag/product facts preserved. New upstream CI jobs that run `pnpm install` get the `setup-sdkwork-siblings` step the fork needs.
5. **Re-record bilingual pairing after every content change.** The upstream verifier (`verify-translation-pairing`) is stricter than the fork's old one; after resolving docs, run `pnpm run verify-translation-pairing --write --all` and fix wrong-locale links with the same rules it reports. Where a pair's md/zh drifted pre-merge (fork's own debt), keep the fork's side consistent and record the remaining drift explicitly.
6. **Verify against the pre-merge baseline.** Typecheck and full tests must not regress relative to `main`: run the same commands on a clean worktree of the pre-merge commit (placed where `../sdkwork-*` siblings resolve — a `/tmp` worktree silently skips the sibling sources and gives a false pass) and compare failure sets. Build `lib/` outputs fully (`pnpm run build:lib`) before judging test results — stale bundles from a previous session produce phantom failures.
7. **Watch the shared sibling checkouts.** `pnpm install` in any worktree relinks `../sdkwork-*` node_modules to that worktree's store. After using a worktree, remove it and reinstall in the main checkout so the siblings point back.
8. **Converge the react family before building.** The fork runs a react 19 overlay over upstream's react 18 manifests via the `overrides` react rows in `pnpm-workspace.yaml`. An upstream merge (or a new sibling manifest) can introduce a react-family specifier the overrides do not match; pnpm then silently materializes a second `@types/react` copy and every federated sdkwork JSX surface fails with `TS2786: cannot be used as a JSX component ... Type 'bigint' is not assignable to type 'ReactNode'`. After merging, run `pnpm install` followed by `pnpm run verify-react-types-convergence` (also wired into the `build` chain and CI shared static gates): it fails when `react` / `react-dom` / `@types/react` / `@types/react-dom` resolve to more than one version in `pnpm-lock.yaml`. Remedy: add the newly merged specifier to the react rows under `overrides` so every copy converges onto one version, reinstall, and re-run. Delete the react rows only when upstream itself upgrades to react 19.
9. **Re-verify the BirdCoder branding (2026-09-04 lesson).** The 2026-09-03 sync let an upstream hero-fish feature (`FISH_LOGO_PATH` swim-morph fallback in `EmptyHero.tsx`) silently revert the product mark to the fish. Before pushing a merge, walk the checklist in AGENTS.md → "BirdCoder brand assets": `grep -rn "FishLogo" packages/client --include="*.tsx" -l` must only hit `ui-primitives` (upstream component, untouched) and prose; every fork surface (sidebar mark, official mark, hero mark) renders `BirdLogo`; `website/` links `favicon.png` (no `favicon.svg` back); `apps/web/public/favicon.png` and `apps/desktop/build/icon.*` still hold the bird raster. Switch any new fish call site to `BirdLogo` — never accept an upstream fish fallback onto a fork surface.

## Conflict decision table

| Surface | Take | Why |
|---|---|---|
| SDKWork-only package/file | ours | upstream has no counterpart; their version would delete the feature |
| Upstream-only file | theirs | fork never customized it |
| `package.json` version line | theirs | fork does not publish; upstream line keeps next sync small |
| Code both sides changed | merge | keep fork behavior, adopt upstream behavior where surfaces do not overlap |
| Generated doc/catalog | theirs + regenerate | generated files must match merged source |
| CI branch names | ours (`main`) | fork's default branch |
| Release tag/product facts | ours | `birdcoder-v*` tags, desktop app, SDKWork relays |
| Logo / brand-mark surfaces | ours (`BirdLogo`) | fork product identity is the BirdCoder bird; upstream fish fallbacks never land on fork surfaces |
| Service interface upstream changed | implement new interface in fork code | reverting the interface would fork upstream's contract |

## Outcome

The 2026-08-21 sync merged 172 upstream commits with 277 conflicted files, added the fork's `sdkwork-` naming contract to AGENTS.md, fixed two real interface gaps (desktop-carrier `renderIndex`; test boot-marker assertion), and landed with zero merge-introduced typecheck or test regressions. The remaining failures (sdkwork sibling API drift, stale bilingual pairs) are pre-existing fork debt tracked by the WIP branch.
