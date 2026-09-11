# Agent Note: non-code modes are titled by the host window, not by an in-page bar

Status: implemented

English | [中文](2026-09-11-sdkwork-window-title-in-native-chrome.zh.md)

## Problem

[The sidebar actions and mode pages change](2026-09-07-sdkwork-sidebar-actions-and-mode-pages.md) gave every non-code mode a shared in-page bar: `AppFrame` rendered a `shell.app-header` seat above the keyed `mode.page` dispatch, and `ui-sdkwork-common-app-header` occupied it with a drag region, the module title, an optional keyed leading-glyph seat, trailing actions, and a window-control footprint.

That bar assumed a frameless desktop shell whose only chrome was the floating cluster from `ui-sdkwork-window-controls`. The shipped shell is framed instead: Electron draws the window's own title bar, and the renderer's window-controls surface is absent, so the in-page bar was a second header stacked under a header the user already had — one that also reserved an 86–107px footprint for a cluster that never rendered.

Three ways to remove the second header:

- **Hide it in the desktop composition only.** The seat is declared by `ui-layout`, which both compositions share, so the bar would still need its own mode-to-visibility wiring, and the web composition would keep drawing a header the desktop does not.
- **Delete the package and the seat.** The mode-to-title copy then has no owner. It cannot move into `ui-layout`: that package is upstream's, and the fork's naming contract keeps fork code in `ui-sdkwork-*` packages.
- **Keep the seat and change what it does.** The seat already receives the frame's effective mode, which is exactly what a window-title projection needs, and it costs no upstream surface beyond the fork's existing rows.

## Decision

The host window's chrome carries the module title for non-code modes.

- **The seat is `shell.window-title`.** `ui-layout` declares it as a single root-scope seat whose owner share is the active mode plus the product title, and `AppFrame` renders it above the keyed `mode.page` dispatch whenever the effective mode (`panelMode ?? mode`) is not `code`. The seat is renamed from `shell.app-header` because it no longer draws a header: no drag region, no keyed leading glyphs, no trailing actions, no window-control footprint.
- **The occupant renders nothing.** `ui-sdkwork-common-app-header`'s `WindowTitle` writes `document.title` as `{module} — {product}` and restores the bare product title on unmount. On the desktop that is the native title bar Electron derives from the page title; on the web it is the browser tab.
- **Code mode keeps its own title owner.** `AppFrame` mounts `DocumentTitle` only while the code surface owns the center column. The two are never mounted together, so a mode switch unmounts one projection before the other's effect runs and they never fight over `document.title`. Previously both could hold the document title, with the session title winning on every mode page.
- **The copy stays with the feature that owns it.** The `appHeader` dictionary (fourteen mode names plus the `mode-titles.ts` roster) stays in the fork package instead of pushing a locale dependency from `ui-layout` into a fork namespace.
- **`AppModeId` is imported where it is used.** `ui-layout/src/client/index.ts` re-exported the type and then used it in its owner-share interfaces without importing it. The package's `noCheck` build hid the dangling reference from the package program, but the emitted declaration carried it, so every consumer of the mode-rail and window-title owner shares resolved the mode to an error type. The fork consumes those shares in a typed projection now, which is how the defect surfaced.

## Verification

```sh
grep -rn "shell.app-header" packages apps                             # no in-page header seat remains
grep -c "shell.window-title" packages/client/ui-layout/lib/client.js  # 2: declaration + render site
npx vitest run packages/client/ui-layout packages/client/ui-sdkwork-common-app-header
```

The per-file coverage gate covers `ui-sdkwork-common-app-header/src/**` — the browser projection and the inert host entry, which the plugin spec pins; `ui-layout/src/*` stays under the client GUI-debt exemption.

## Alternatives considered

- **Keeping the bar and hiding it per composition.** It leaves the shared composition drawing chrome the desktop shell already provides, and the two compositions drift.
- **Projecting the title from a root hook.** A new `GlobalStandardProps` member or a `ctx.layout` observable would let the projection read the mode without the seat, but both widen contracts that every client test fake implements, and the seat already carries the mode as owner props.
- **Per-mode-page title effects.** Each mode page would project its own title, which keeps ownership local but repeats the projection across the mode plugins and leaves the sidebar-launched overlay modules unaccounted for.

## Consequences

- **The window names what the page shows.** Switching to a module page rewrites the native title bar to `{module} — {product}`; the browser tab follows on the web. Code mode keeps the Session title, so the two projections never contend.
- **The mode roster is exhaustive by construction.** `MODE_TITLE_KEYS` is a `Record<WindowTitleMode, AppHeaderKey>` over the `AppModeId` union, so a new mode id fails the fork package's typecheck until the roster and the `appHeader` dictionary gain their row — a deliberate build-time cost instead of an untyped fallback title.
- **The bar's extension points are gone.** Nothing occupied the keyed leading-glyph seat or the trailing-action region besides the bar itself, but a future fork feature that wanted in-page module actions has no seat to claim now.
- **Both compositions lose the bar.** The web composition drew the same header and now shows the module name in the tab instead. No per-composition visibility wiring was needed, which is the point of changing the seat rather than hiding it.
- **The seat is a fork edit inside an upstream file.** `ui-layout` stays upstream's, so an upstream change to the shell frame can collide with the renamed seat; the greps above are the merge-time check.
- **A new mode page needs no new code.** The `mode.page` dispatch and every mode plugin are untouched — the title is one occupant of one seat, driven by the frame's effective mode.
