# Agent Note: The PDF preview reads as one continuous, lazily drawn strip

Status: implemented

English | [中文](2026-09-11-sdkwork-pdf-preview-continuous-strip.zh.md)

## Problem

Through the fidelity ([2026-09-10](../architecture/2026-09-10-sdkwork-pdf-preview-office-fidelity-round.md)) and find ([2026-09-11](2026-09-11-sdkwork-pdf-preview-find-in-document.md)) rounds the strip showed exactly one page: every page change swapped the raster, reset the scroll, and re-rendered. Real readers — and the PDF format's own reading model — present the document as a continuous vertical strip the reader scrolls through, and the gaps showed in use: no reading flow across a page boundary, no sense of document length, and a zoom or rotation that had to repaint the whole view from one page.

## Decision

The body renders every page as a frame in one scrolling strip; the single-page render became a per-page component:

- **`PageView` owns one page.** Each frame draws when it approaches the stage viewport (an IntersectionObserver over the strip with a one-viewport prefetch margin; environments without the observer draw immediately) and releases its raster and text runs when it leaves, so a several-hundred-page document keeps only the nearby rasters alive. One viewport drives the frame's canvas, text layer, and find-highlight bands; the page reports its point size back to the strip after its first draw, so mixed-size documents correct their own layout.
- **Scroll position is the selection.** The frame under the viewport centre is the selected page; scrolling updates the shared paged-view store, which moves the rail highlight, the counter, and the find flow with it. Commands run the other way: rail clicks, the page entry, stepping, Home/End, and match navigation record a scroll target that the next commit lands on the page's top. A target outliving a dead strip (the worker died mid-navigation) is dropped on the next commit.
- **Zoom and rotation stay anchored.** Zoom commands capture the strip's scroll ratio and a commit-time layout effect re-applies it over the relaid-out height; rotation swaps each frame's layout dimensions while the viewport renders the turned raster, and the per-page highlight bands re-map through the turned viewport's matrix.
- **Search inherits the strip.** The find flow keeps its query, match list, and active index in the body; each `PageView` bands only its own page's matches from the shared text index, so highlighting, scrolling, and match walking compose without new state.

## Alternatives considered

**Virtualise the strip (unmount far pages entirely).** Unmounting would discard scroll height and text selection across long documents; frames with released rasters keep the layout exact at the cost of one empty canvas per far page, which is the same trade the official viewer makes.

**Default every frame to page 1's size until read.** This is what the strip does (the default comes from page 1's viewport, then each page corrects itself); reading every page's size up front would cost one worker round-trip per page before the first paint.

**Keep single-page mode behind a toggle.** Two rendering modes double the state space of every feature that touches the stage — zoom anchoring, find jumping, scroll sync — for a mode no commercial reader offers as the default.

## Consequences

The reader scrolls a document the way readers expect: pages flow, the counter and rail follow, zoom and rotation hold their place, and find jumps land on highlighted pages anywhere in the document. Memory tracks the visible neighbourhood because off-screen rasters release. The known-limitations list records what remains: mixed-size pages lay out at page 1's size until first drawn, and there is no spread (two-page) view. Coverage pins the strip at the repository's per-file 100% gate: per-page draw/release on visibility, geometry reporting, scroll-derived selection, command scrolling onto a page top, zoom anchoring across relayout, the dropped stale target, and the zero-page document.
