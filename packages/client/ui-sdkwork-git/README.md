---
description: "SDKWork git plugin: session-header branch pill (project branch + uncommitted changes) opening a branch-switcher popover with search, a centered create-and-checkout modal, and a centered screen-adaptive git graph modal (70vw × 70vh) with the SVG lane graph and ref badges."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-git

English | [中文](README.zh.md)

## Summary

This plugin adds a git branch pill to the conversation session header. The pill shows the current session project's checked-out branch (a branch name, or the short commit hash on detached HEAD) and opens a popover when clicked:

1. Branch list: every local branch, the current one first with a check mark and, when the tree is dirty, an "uncommitted changes: N files" line.
2. Search field filtering the list as you type.
3. "Create and check out a new branch", which opens a centered form modal (name field, HEAD-only hint, cancel/confirm; git's ref-format check validates the name host-side).
4. "Git graph", which opens a centered screen-adaptive modal (70% of the viewport width and height): a sticky 图/描述/日期/作者/提交 column strip, an SVG lane graph computed from the commit topology, ref badges (HEAD, local branches, remote-tracking refs, tags), and a refresh button.

Checking out a branch switches the host repository immediately and the pill refreshes from a fresh status read. All repository facts travel the `sdkworkGit` Typert Remote, served by `@deepseek-ai/dsh-sdkwork-git` (the host git capability over simple-git). The pill renders nothing when the session has no project directory or the host rejects git reads, so compositions without a repository keep the header unchanged.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>

## Use this package

Mount the plugin as part of the web-app bundle together with its host capability and Remote controller (three roster rows in `packages/bundle/web-app/cordis.patch.yml`: `sdkwork-git`, `sdkwork-git-controller`, `ui-sdkwork-git`, plus the workspace dependencies in the web-app and desktop manifests). Removing the `ui-sdkwork-git` row removes the pill; removing the host rows keeps the plugin mounted but the pill stays hidden because the Remote namespace never serves a status.

<a id="understand-the-implementation"></a>

## Understand the implementation

- `src/client/index.ts` — registers the dictionaries and contributes the pill to the `conversation.session.header.actions` seat (order `-10`, right of the title cluster, ahead of the session-log action strip). The port is built once from the mounted `remote.sdkworkGit` namespace; a composition without that namespace mounts no pill.
- `src/client/gitPort.ts` — the structural `SdkworkGitPort` over the generated Remote namespace (status, branches, checkout, createAndCheckout, log) with wire failures flattened into Errors.
- `src/client/GitBranchPill.tsx` — the pill and popover. React state only: one status read per project-directory change (the session cwd rides the `useSessions` standard prop) and a branch-list read per popover open. The panel is portaled to `document.body`, positioned with the shared `useAnchoredPosition`, dismissed on outside pointerdown and Escape; its footer rows open the two product dialogs and close the popover.
- `src/client/GitGraphModal.tsx` — the screen-adaptive (70vw × 70vh) graph dialog over the shared `Modal` primitive (headless): sticky column strip, one SVG per row rendering the lane node and the edges toward the next row, ref badges, and a refresh button that re-reads the log.
- `src/client/GitCreateBranchModal.tsx` — the centered create dialog over the shared `Modal` primitive: name field with autofocus, host rejections rendered inside the dialog, success closes it and refreshes the pill status.
- `src/client/gitGraphLanes.ts` — the lane layout: each commit renders on the lane that carries it, the first parent continues on the node's lane, further parents take the first free lane or merge into the lane already carrying them, and a parent cut off by the page bound still occupies its lane so the cut keeps its curve.
- `src/client/GitBranchPill.module.css` — the chip language for the trigger plus the menu-surface tokens (`--dsw-specific-menu` + `--dsw-elevation-prominent`) for the panel.
- `src/client/locales.ts` — the plugin-owned `sdkworkGit` namespace (zh source of truth, en key-identical).

The plugin owns presentation only; every mutation is a user-initiated checkout through the host capability.

<a id="known-limitations-and-deferred-work"></a>

## Dev Note

This is a fork package (`sdkwork` marker) following the repository naming contract. The pill mounts only when the api-remotes assembly exposes `remote.sdkworkGit`, and the header-actions registration rides the deferred `slots.inject` so fiber teardown (HMR replacement) removes it.

## Runtime invariants

No runtime-invariant companion checks; the package is a UI plugin whose single slot registration is verified for fiber teardown (HMR safety) by its spec suite, and the pill's render behavior plus both dialogs are exercised over a fake git port, with the lane layout covered by its own spec.

## Model Experience

None, as this package is browser-side git presentation; its checkout verbs change repository state on the host, and the host git capability registers nothing model-facing.

#### KV Cache effect

None; the pill reads session-store rows and host git reads without assembling or mutating provider requests.

## Known Limitations and Deferred Work

- The graph modal renders the recent-window topology (up to 200 rows per read); paging older history and a commit-details pane are deferred.
- Checkout refuses when git reports conflicts with uncommitted changes; the popover surfaces the host error message. A stash-aware flow is deferred.
- Only local branches are listed in the popover; remote-tracking branches are deferred.
