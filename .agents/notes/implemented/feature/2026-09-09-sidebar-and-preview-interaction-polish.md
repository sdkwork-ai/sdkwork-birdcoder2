# Agent Note: Sidebar and preview interaction polish

Status: implemented

English | [中文](2026-09-09-sidebar-and-preview-interaction-polish.zh.md)

## Problem

Five small interaction defects around the right Sidebar and the document preview. Every session's surface was born with a seeded default page, so a collapsed column the user never opened already held a page, and the first open into a fresh surface showed the seed beside the content it opened. Page tabs deduplicated surface-wide: opening a page whose tab sat in the other pane pulled focus across panes instead of opening it where asked. Dragging a pane's sole tab onto its own edge did nothing, though the user plainly asked for a split. A dropdown over the HTML preview did not dismiss on a click inside the sandboxed iframe, because that pointerdown never reaches the parent document. And the code preview's copy banner and card background scrolled away under horizontal scrolling, while the code kept the chat card's gray fill instead of sitting on the pane's own background.

## Decision

**Default pages seed lazily.** `createSurface` in [stores.ts](../../../../packages/client/ui-sidebar-right/src/client/stores.ts) mints a collapsed, empty surface; the store's `advance` passes the seed factory to `planSettle` only when the intent leaves the column expanded. The expansion that would first show an empty layout is what seeds the then-current default page, and closing the last closable tab collapses the column and leaves the layout empty until the next expansion. The [last-tab close rule](2026-09-08-sidebar-last-tab-close-rules.md) and [default-page selection](2026-09-08-sidebar-default-pages.md) stay as decided; default pages are created on expansion. Splitting an empty pane is a no-op: it mints no tabs, records no history, and reports no new pane.

**Page uniqueness is pane-scoped.** The guide-only merge generalized to every page kind (`pageKind`/`panePage`): opening a page focuses an existing tab only inside the pane the open targets, and a page dragged, dropped, or docked into a pane already showing that kind's page merges into the pane's own. Resource tabs keep the kit's surface-wide reveal.

**A sole tab splits its own pane when a factory backfills it.** `planDropTab` in [planner.ts](../../../../packages/client/ui-dockkit/src/engine/planner.ts) takes an optional `TabFactory`; with one, the previously refused self-edge release splits, the factory's tab backfills the vacated pane before the move so the dragged tab ends focused. Without a factory the release still changes nothing.

**Menus close on focus entering an iframe.** [Menu.tsx](../../../../packages/client/ui-primitives/src/Menu.tsx) adds a window `blur` listener gated on `document.activeElement instanceof HTMLIFrameElement` — the focus move is the only signal a pointerdown inside a cross-origin iframe leaves, and the gate keeps app or tab switches from closing the list.

**The code preview pins its banner and drops the card fill.** With wrap off, [CodeBody.module.css](../../../../packages/client/ui-sidebar-documentpreview/src/client/code/CodeBody.module.css) sizes the renderer `max-content` so the sticky banner has the full scroll width to ride, and pins the banner `sticky; left: 0; width: 100cqw` against the document scroller (`container-type: inline-size` on the preview body). The shared CodeBlock's fill is routed through a new `--dsl-code-block-background` variable (default unchanged, so chat keeps its gray card) and the shared banner carries an inert `data-code-block-banner` hook; the preview sets the variable to `transparent` so code sits on the pane's own background.

## Alternatives considered

**Keep seeding at surface creation.** A collapsed column held a page nobody asked for, and the seed took slot 0 of every fresh surface ahead of the first real open.

**Keep surface-wide page dedupe.** Focus jumped to the other pane on an explicit "open here", the exact complaint that started the change.

**A bare window-blur close for menus.** Closes the list on every app or tab switch; the `activeElement` gate scopes the close to the one case the document cannot see.

**An inner code scroller for the horizontal axis.** Restoring `overflow-x: auto` on the `pre` keeps the banner still, but puts the horizontal scrollbar at the bottom of the whole block — unreachable in a long file — and both axes deliberately live in the document owner's scroller.

## Consequences

`planDropTab`'s factory parameter is new kit API any embedder may pass; `planSettle` already accepted an absent factory, which now also names the Sidebar's collapsed-state behavior. The `--dsl-code-block-background` variable and `data-code-block-banner` attribute are the code block's owner-styling seam; no shared stylesheet rule targets the attribute. Kit planner specs cover the backfilled self-split and its focus order; Sidebar store, service, and seat specs cover lazy seeding, pane-scoped page merges, and the empty collapsed layout; a Menu spec covers the gated blur close. The `ui-sidebar-right`, `ui-dockkit`, and `ui-sidebar-documentpreview` READMEs restate the rules.
