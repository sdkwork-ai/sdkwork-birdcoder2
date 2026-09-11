---
description: "Word previews in the right Sidebar: an offline WordprocessingML renderer with a page rail and a paginated page canvas that follows the file's own styles, numbering, and section geometry."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-docx-preview

English | [中文](README.zh.md)

## Summary

Draws `.docx` documents in the right Sidebar's document tab. The package claims the word-processing suffixes in the document registry, then contributes the keyed body that flows pages beside a numbered page rail, with zoom, page stepping, and the section's own headers and footers. Parsing happens in the browser from the package bytes the document owner already reads, resolving the styles cascade, the numbering counters, and the section geometry, so a page lays out like Word's without a server, a converter, or a network round trip.

## Table of Contents

- [What it registers](#what-it-registers)
- [How it renders](#how-it-renders)
- [Interaction](#interaction)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **Renderer metadata** — `ctx.documentPreviews.register(...)` with id `@deepseek-ai/dsh-client-ui-sdkwork-docx-preview/docx`, suffixes `docx`, `docm`, `dotx`, `dotm`, and `doc`, and `loading: 'bytes-complete'`. Leaving `priority` unset puts the registration in the `extension` band, which outranks the builtin band, so a document never falls back to the plain-text reader. `bytes-complete` makes the document owner call its existing `readAll` path, so this package performs no file read of its own.
- **The body** — the keyed `sidebar.right.tab.document` seat under that same id, in the Session-scoped store declared by the registration. The body receives `resourceAddress`, `content`, `wrap`, `scrollportRef`, and `useTabInfo`; it owns everything inside the tab below the document toolbar. The stage element is the renderer's scrollport, so the owner restores the previous scroll offset across remounts.
- **Shared viewing state**, bucketed by tab id: the selected page and the zoom, either `'fit'` or a fixed multiple. The store outlives body unmounts, so switching tabs and coming back returns to the same page.

`doc` is claimed deliberately even though the renderer cannot draw the legacy binary format. Falling through to the plain-text reader would report that a presentable file is "not text"; claiming it lets the body name the real reason and the fix.

<a id="how-it-renders"></a>
## How it renders

- **Container and parts** — the shared OOXML library reads the OPC package from its central directory; `document.ts` walks the package root → main document → styles, numbering, settings, theme, media, and the per-section headers and footers. A section without header or footer parts inherits the previous section's, and a continuous section break flows onto the shared page instead of opening one, unless that break declares stories of its own.
- **Styles** — `format.ts` reads one property element into a partial format, `styles.ts` merges `w:docDefaults` with the `w:basedOn` chain, and `content.ts` adds the paragraph mark, the character style named by `w:rStyle`, and the run's own properties. A table style's `w:tblStylePr` conditional bands (first row, banded rows and columns, last row) resolve with the table's `w:tblLook`: their shading and borders decorate the cells they cover, and their run properties join the cascade under the paragraph style of the blocks those cells hold.
- **Line layout** — a multiple `w:spacing/@line` counts natural lines of the typeface, the way Word lays a line out, so the body probes the font's natural line height once and turns multiples into absolute line heights; exact and at-least rules already state pixels. Word adds the space after one paragraph to the space before the next, so flow margins are precomputed per block list, the first block of a page drops its spacing, and an empty paragraph is exactly its paragraph mark's line tall.
- **Numbering** — `numbering.ts` keeps one counter array per numbering instance and renders each level's `lvlText`, so `%1.` becomes a running ordinal, `%2)` a letter, and a bullet stays a bullet.
- **Content** — paragraphs, hyperlinks, tracked insertions, simple and complex fields, tabs, symbol runs, line and page breaks, and pictures. A `w:sdt` content control is transparent: wrapped paragraphs, tables, and runs read as if bare; `w:del` is skipped and a `w:vanish` run is not drawn. External hyperlinks answer only `http`, `https`, and `mailto`; an in-document link scrolls the stage to the paragraph holding the matching `w:bookmarkStart`.
- **Pagination** — `paginate.ts` splits a section's blocks into pages from measured heights, honouring explicit breaks, `w:keepNext` chains, and `w:keepLines`. A paragraph that straddles a page boundary divides at a line edge — leaving at least two lines on each side, Word's widow-and-orphan default — and a table divides between rows, repeating its `w:tblHeader` rows on the continuation; a cut a vertical span reaches across moves the table whole. The body performs the measurement in a hidden container of the exact content width.
- **Tables** — `table.ts` resolves the grid, the merge spans, and nested tables, and `render/` draws a real HTML table so the browser places the cells. A vertically merged continuation is matched by grid column, a continuation with no restart above draws empty, and a cell's own margins and an exact row height (which clips) override the table's.

Media parts become Blob URLs created with the parsed document and revoked with the effect that produced it, so switching files or closing the tab cannot leak them.

<a id="interaction"></a>
## Interaction

The rail lists every page with a live thumbnail numbered in document order; the selected page carries `aria-selected` and a brand-coloured frame. A page paints only around the rail's viewport, so a long document keeps a few dozen live canvases instead of hundreds, and the rail scrolls to the selected page. Under a 520 px tab the rail collapses and the stage takes the full width.

The toolbar steps to the previous or next page, zooms out and in by one step, returns to `1:1`, and toggles the window-fitting scale; the fit button doubles as the zoom readout, and `Ctrl` + wheel zooms. `PageUp`/`PageDown` step pages; the arrow keys scroll the page and step only at its edge, the way a PDF reader behaves; `Home`/`End` jump to the first and last page. A page is an image to assistive technology and names its own number.

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Legacy `.doc` is explained, not drawn.** The Word 97–2003 binary format is a different container entirely; the body reports it and names the fix instead of showing an empty page.
- **Pagination estimates rather than re-flows.** A table row that a page cannot hold moves whole rather than splitting at a line, so a row taller than a page clips, and a cut that a vertical span reaches across moves the table whole instead of continuing its cells.
- **An anchored drawing is placed in the text flow.** `wp:anchor` geometry is read for its size, but a floating picture or shape is drawn where its anchor sits rather than at its absolute offset, and text does not wrap around a shape.
- **Fields other than `PAGE` and `NUMPAGES` show their cached result.** Word stores the last computed text in the file, which is what any other field draws; refreshing a field or evaluating a formula needs a layout engine, not a reader.
- **Equations, embedded objects, and text boxes are not drawn.** Office Math renders as its fallback text, an OLE object or chart renders as a labelled placeholder, and a `w:txbxContent` box draws nothing.
- **Footnotes and endnotes are not read.** The footnote parts and their references draw nothing.
- **Tab leaders are not drawn.** Custom stops move the following text to a left, center, or right layout the way Word's stops behave, but the dotted or dashed leader line Word paints along the run is not drawn, and a center stop balances between its neighbours rather than at its exact declared position.
- **Embedded fonts are not decoded.** An obfuscated `odttf` part falls back to the viewer's fonts; a document that relies on an embedded typeface lays out with the fallback's metrics.
- **Word's grid and CJK line pitch are not applied.** `w:docGrid` and `w:snapToGrid` are ignored, so a document snapped to a document grid packs slightly differently than Word.
- **Word's autofit column balancing is approximated.** A table without `w:tblLayout w:type="fixed"` lets the browser's table algorithm balance the declared columns against content; Word distributes the leftovers with its own autofit heuristic, so column ratios on an autofit table can differ from Word's.
- **Right-to-left runs follow the browser's bidi rules.** `w:bidi` sets the paragraph direction and `w:bidiVisual` reverses a table's column order, but fine-grained mixed-direction run ordering inside a line is the browser's own bidi layout rather than Word's exact algorithm.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The renderer is deliberately a subset, chosen from what ordinary business documents contain rather than from the schema. `render/` and `docx/` are presentation-agnostic: nothing in either imports Cordis, a slot, or another plugin, and the block reader receives the table reader through its context so those two modules never form a cycle. Test fixtures build their ZIP containers in code (`tests/zip-fixture.ts`) so no binary test data is needed and every container variation is expressible as a test input.

</details>

**Runtime invariant:** No companion is published. The parse is a pure function from package bytes to a model, and the viewing state belongs to the declared Slot store; there is no second independent observation to compare against. Registration disposal and the Blob URL lifetime are covered by behavior tests.
