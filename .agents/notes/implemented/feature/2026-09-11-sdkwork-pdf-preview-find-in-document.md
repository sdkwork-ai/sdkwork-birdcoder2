# Agent Note: The PDF preview finds text across pages and highlights it on the canvas

Status: implemented

English | [中文](2026-09-11-sdkwork-pdf-preview-find-in-document.zh.md)

## Problem

After the fidelity rounds ([2026-09-10](../architecture/2026-09-10-sdkwork-pdf-preview-office-fidelity-round.md)) the largest remaining reader gap was find-in-document: the office previews' readers could select and copy text, but a reader looking for a phrase in a hundred-page PDF had no box to type into, no match count, and no way to jump to a hit. The text layer made the words technically present in the DOM, yet nothing scanned them and nothing showed where a hit was.

## Decision

Find lives in a new `pdf/search.ts` module with no new dependency, wired into the existing body:

- **One lazy text index per open document.** `PdfTextIndex` reads each page's text content once through PDF.js and caches it, so the first query pays one worker round-trip per unread page and every refined query after that re-reads nothing. A new byte identity starts a fresh index and clears the search.
- **Matching is over concatenated item text.** Each page's runs are joined case-insensitively; every hit records its page, owning item, and character range, so matches report in reading order across pages and a hit that spans a style boundary stays anchored to the item holding its first character.
- **Highlights are bands mapped through the render viewport.** `matchRect` places a match's fractional run through the viewport's user-to-viewport matrix, mapping two corners of the band — the baseline ends and the ascent line — so the band lands on the glyphs at any of the viewer's 90° rotations and any zoom. Bands sit over the raster, under the selectable spans, with `pointer-events: none`, so selection and copy behave exactly as before; the active match paints stronger than the page's other matches.
- **The toolbar owns the flow.** The find box scans as you type; a summary reports `{index} / {total}` or "no matches"; arrow buttons walk matches in reading order and wrap; activating a match on another page opens that page, which lands on its top like every other page change. `Escape` clears the query, `Enter` steps forward, `Shift+Enter` steps back, and the buttons report themselves to assistive tech through their labels and the live match summary.

The body hosts no search state beyond the query, matches, and active index; everything else is derived — highlight bands recompute from the matches, the selected page's cached text runs, and the latest render's viewport transform, so rotation and zoom move the bands with the page.

## Alternatives considered

**Reuse PDF.js's find controller and `TextHighlighter`.** The official machinery delivers character-exact highlights, but it is event-bus-coupled to the full viewer, expects its own page registry, and would drag the viewer module into the sidebar bundle. The band approach covers the reader's need inside this package's architecture; character-exact splitting of spans remains available later if proportional bands ever read as imprecise.

**Search only the current page.** Highlighting without a document-wide scan is nearly free, but the reader's question is "where in this document" — a page-local answer still forces a manual page walk, which is the gap this feature exists to close.

**Match diacritic-insensitively through PDF.js's normalization.** The official finder folds accents via normalized text content; our fixture corpus has not needed it, and the fold can be added inside `PdfTextIndex` without touching any consumer.

## Consequences

A reader can find a phrase anywhere in the document, see the count, walk the hits in reading order, and land on each hit's page with the hit highlighted on the canvas at any zoom or rotation. Search state resets with each new byte identity, unreadable pages make a document quietly unsearchable rather than throwing, and the scan is cancellable so typing refinements never race. Coverage pins the matching table (case folding, multi-item pages, spanning clamp, multi-page order, abort, caching), the band geometry (identity, rotated, empty-run cases), and the body flows (scan, summary, wrap, cross-page jump, Escape, unreadable-page quiet) at the repository's per-file 100% gate. The known-limitations lists now record what remains of find: no diacritic folding and first-run highlighting across style boundaries.
