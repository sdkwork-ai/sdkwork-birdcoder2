# Agent Note: SDKWork session-header workspace chip and git branch pill

Status: implemented

English | [中文](2026-09-06-sdkwork-git-branch-pill-and-workspace-chip.zh.md)

## Problem

The conversation session header identified a session only by its title breadcrumbs; the project directory behind the session (the cwd every session already carries) was invisible once the conversation was underway, and the project's git state — which branch is checked out, how much is uncommitted — required leaving the app. The two reference designs put a folder chip (project directory name) right of the title and a branch pill beside it that opens a branch popover with search, checkout, create-and-checkout, and a commit graph.

## Decision

Two fork surfaces compose into the header row, both fed by facts that already exist:

- **Workspace chip in `ui-sdkwork-conversation-header`.** The surface component reads the session cwd through the `useSessions` global standard prop (the same store `ConversationRoot` already reads) and renders a non-interactive chip — folder glyph + `workspaceTitleOf(cwd)` basename — between the breadcrumbs and the action strip. No new wire call, no new store: the chip is a projection of a store row that never left the client. It hides while the session has no cwd (blank sessions before a workspace is picked), so the header never shows a placeholder for a fact it does not have.
- **Git branch pill in the new `ui-sdkwork-git` client plugin.** A pill at `conversation.session.header.actions` order `-10` (right of the title cluster, ahead of the session-log strip) shows the checked-out branch and opens the popover: branch list with the current branch first plus the dirty-count line, a search filter, create-and-checkout, and the git graph. The popover is portaled and positioned with the shared primitives (`useAnchoredPosition`, `useDismissOnOutsidePointer`), so it inherits the shell's floating-layer behavior instead of re-rolling geometry. Both graph and create are product dialogs, not popover views: the graph opens a centered screen-adaptive `Modal` (70% of the viewport width and height) with a sticky 图/描述/日期/作者/提交 column strip, ref badges, a refresh button, and an SVG lane graph the client computes from the log rows' parent topology (gitk-style: first parent continues the node's lane, further parents take a free lane or merge); create-and-checkout opens a centered form modal. The host log therefore carries parents and decorations (%D classified against `refs/remotes`, HEAD attributed from rev-parse) instead of ASCII graph text — topology, not glyphs, is the wire truth.

The host side is the standard capability seam, mirroring `sdkwork-app-build` exactly: `packages/host/sdkwork-git` is the seam service, and `packages/api/sdkwork-git-controller` is the Typert Remote. The repository chose **simple-git** as the professional local-git library: it drives the installed git CLI (full protocol support, real-world edge behavior, no reimplemented plumbing) with per-call subprocess timeouts. The service is stateless per call — a fresh SimpleGit handle per request bound to the resolved directory — and every call validates absolute/existing/directory and repository membership before running git. Failures are a closed five-code vocabulary (`cwd-unreadable`, `not-a-repo`, `branch-name-invalid`, `checkout-failed`, `command-failed`), projected by the controller onto `git/*` wire codes; the request shapes are declared locally in the controller because the typert generator crashes on cross-package type re-exports (the `sdkwork-app-build-controller` discipline, again).

Wire reads are cheap and mutation is strictly user-initiated: one status read per project-directory change, one branch-list read per popover open, one log read per graph open/refresh, and checkout/create only from explicit clicks. Checkout of a missing branch is confirmed host-side before switching, so the UI never sees raw git output. Compositions without the controller mount the plugin but never a pill (`remote.sdkworkGit` absent → no registration), matching how `ui-sdkwork-deploy` hides its build button.

## Alternatives considered

- **Bare `child_process` git invocation.** Rejected: simple-git's option handling (baseDir, timeouts, config), error typing, and parsing utilities delete exactly the hand-rolled subprocess plumbing this repository prefers to buy.
- **isomorphic-git (pure JS).** Rejected for a host that already ships git: the CLI binary implements every protocol and edge behavior, and a pure-JS reimplementation would diverge from what the user's own git sees.
- **A new header slot for the chip.** Rejected: the chip is a projection of a session store row, not plugin-contributed content; putting it directly in the surface component keeps one store read and no new contract.
- **Polling/refreshing status on a timer.** Rejected: status reads spawn subprocesses; refresh happens on the events that can change the answer (project-directory change, popover close after an action).
- **ASCII graph text as the wire truth.** Rejected when the graph became a product dialog: the client needs topology and decoration classes to draw lanes and badges, so the host log now ships parents and classified decorations instead of glyphs.

## Consequences

- The controller's wire vocabulary (`packages/api/sdkwork-git-controller/src/types.ts`) mirrors the seam types structurally; a seam type change must update the controller copy in the same change.
- Unborn repositories (no commits yet) fail `status` because HEAD cannot resolve; the pill hides. A first-class "no commits yet" state is deferred.
- Only local branches are listed in the popover; remote-tracking branches, stash-aware checkout are deferred. The graph modal renders the recent window (up to 200 rows); paging older history and a commit-details pane are deferred.
- The web-app bundle gains three rows (`sdkwork-git`, `sdkwork-git-controller`, `ui-sdkwork-git`); the desktop shell inherits them through the web-app base.
