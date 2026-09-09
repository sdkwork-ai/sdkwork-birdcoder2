# Agent Note: The explorer's applied-change diff tab for edit/write file links

Status: implemented

English | [中文](2026-09-09-sdkwork-explorer-applied-change-diff-tab.zh.md)

## Problem

Clicking the file path in an edit/write tool row opened the file's current content as a plain read-only tab (or handed the path to the operating system). The change itself — what the call added and removed — was visible only inside the collapsed row's diff card, capped at eight body lines. Reviewing an applied change therefore meant expanding a small card or reading the post-image and reconstructing the difference by eye. Worse, the explorer's Monaco kernel could not have rendered any richer view: its boot callback bailed when the editor host element was absent, and the pre-boot fallback branch did not render that element, so the kernel never booted, every file tab stayed on the lightweight listing, and the editable source tab could not actually edit.

## Decision

The explorer's cross-bundle gesture bus (`ui-sdkwork-explorer/src/client/bus.ts`) grows a third channel, `sdkwork:explorer:open-diff`, carrying `{ path, cwd, hunks }`. `ui-chat`'s `openFile` — the single seam every tool row's file link already goes through — dispatches it when the caller passes applied hunks, which `ToolRow` now does whenever a diff card is rendered on the row. A loaded explorer always claims the gesture and opens a **diff tab**: the Monaco diff editor, the same kernel VSCode's git diff renders with, over the hunks' reconstructed pre-image and post-image, with word-level highlighting, collapsible unchanged regions, a minimap, and an inline/side-by-side toggle. Until the editor chunk imports, the same hunks render through the primitive `DiffBlock`, so the tab paints instantly and upgrades in place. The header counts the changes and offers 源码编辑 (edit source), which opens the changed file's editable source tab through the existing `openFileSource`; the preview stays read-only and the source tab is its editing face.

Because the applied hunks are already persisted in the session log as tool-result metadata, the preview is replay-safe: an old session re-renders the same diff without touching the filesystem. `diffPairModel` rebuilds the two sides from the hunks in file order, separating consecutive hunks with the same elided-gap sentinel `patchReconstruct` uses; the diff editor aligns the sentinels, so each hunk's change highlights on its own rows.

The tab ledger keeps **one change tab per file**: a second open-diff gesture for the same path refreshes the existing tab's hunks in place and activates it (VSCode's working-tree-diff semantics), so clicking a file after a further edit shows the fresh change instead of stacking stale tabs. Both the diff editor's models swap values on refresh; the editor instance survives.

The gesture bypasses the file open-mode policy and always claims. The open-mode setting (built-in pane / system app / ask) governs where a *file* opens; a change preview has no system-application arm — the operating system has no patch viewer to hand the hunks to — so asking would only add a step in front of the only meaningful destination. Malformed hunks (not an array, or entries without a string `path` and a string `newText`) stay unclaimed, so the dispatcher's plain-file arms still give the click an outcome.

The MonacoFileView boot fix is part of this change on purpose: the diff tab copies the file tab's three-phase structure (fallback, kernel boot, host swap), and the fix's rule is what makes both work — **a Monaco tab body's host element must stay mounted from the first render, with only its `hidden` state flipping when the kernel boots**, because the boot callback targets the element by ref the moment the dynamic import resolves. The early-return fallback shape cannot satisfy that rule.

## Alternatives considered

**Keep opening the plain file.** Rejected: the post-image alone does not answer "what changed", which is the reason a user clicks a mutated file; the row's diff card caps at eight lines and cannot scale into a review surface.

**Render the primitive `DiffBlock` as the whole tab body (no Monaco).** Rejected: the explorer's editor bar is the VSCode kernel; `DiffBlock` has no word-level highlighting, folding, minimap, or side-by-side layout. It remains exactly where it adds value — the pre-boot paint and the chat row.

**Apply the open-mode policy and chooser to the diff gesture.** Rejected: the chooser's native arm is meaningless for a patch, and a policy gate in front of the only meaningful destination just delays the click. The always-claim rule is what makes "clicking a changed file lands on its diff" predictable.

**Derive the change from the filesystem or git at open time.** Rejected: the applied hunks are already durable session data; deriving from git would fail outside a repository, diverge from what the tool actually applied, and break replay of historical sessions.

## Consequences

Clicking the file path in an edit or write row now lands on the applied-change diff preview in the explorer's right-hand column — added and removed lines read directly, with the change counts, an inline/side-by-side toggle, and the 源码编辑 button that opens the editable source tab. Clicking the same file after a further edit refreshes that preview in place. Without the explorer plugin loaded, the click keeps the historical plain-file behavior: the gesture bus stays unclaimed and the native opener runs. Coverage pins the shape: `diff-tab.client.spec.tsx` (gesture claiming and its policy bypass, malformed-gesture fallback, one-tab-per-file refresh, hunk-to-pair reconstruction, the tab body's fallback-then-boot upgrade, header counts, layout toggle, and the source-editor affordance over a stub Monaco kernel), `tool-row.client.spec.tsx` (the mutation row rides its hunks to `openFile` while cardless rows pass none), and `apply-inject.client.spec.tsx` (the cwd-resolved diff dispatch and the unclaimed fallback through the plain-file arms). The MonacoFileView boot rule this note records — host mounted from first render, `hidden` flips at boot — is what the source tab's editing relies on; a future fallback shape that early-returns without the host will silently strand every tab on its fallback again.
