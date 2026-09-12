---
description: "PowerPoint previews in the right Sidebar: an offline OOXML renderer with a slide rail and a slide canvas that follows the file's own theme, master, and layout."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-pptx-preview

English | [中文](README.zh.md)

## Summary

Draws and edits `.pptx` presentations in the right Sidebar's document tab. A press puts PowerPoint's selection frame and its eight handles on a shape, and a double-click opens an editor over the shape that keeps the shape's own paint beneath and each line's own alignment and type, ending on a blur, a click away, or `Esc` — the canvas re-renders as you commit. The speaker-notes pane under the stage is always editable, and `Save a copy` downloads the presentation with only the touched parts rewritten. The package claims the presentation suffixes in the document registry, then contributes the keyed body that renders one slide beside a thumbnail rail, with zoom, slide stepping, and speaker notes. Parsing happens in the browser from the package bytes the document owner already reads, through the slide → layout → master → theme inheritance chain, so a slide looks like what PowerPoint drew without a server, a converter, or a network round trip.

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

- **Renderer metadata** — `ctx.documentPreviews.register(...)` with id `@deepseek-ai/dsh-client-ui-sdkwork-pptx-preview/pptx`, suffixes `pptx`, `pptm`, `ppsx`, `potx`, and `ppt`, and `loading: 'bytes-complete'`. Leaving `priority` unset puts the registration in the `extension` band, which outranks the builtin band, so a presentation never falls back to the plain-text reader. `bytes-complete` makes the document owner call its existing `readAll` path, so this package performs no file read of its own.
- **The body** — the keyed `sidebar.right.tab.document` seat under that same id, in the Session-scoped store declared by the registration. The body receives `resourceAddress`, `content`, `wrap`, `scrollportRef`, and `useTabInfo`; it owns everything inside the tab below the document toolbar. The stage element is the renderer's scrollport, so the owner restores the previous scroll offset across remounts.
- **Shared viewing state**, bucketed by tab id: the selected slide and the zoom, either `'fit'` or a fixed multiple. The store outlives body unmounts, so switching tabs and coming back returns to the same slide.

`ppt` is claimed deliberately even though the renderer cannot draw the legacy binary format. Falling through to the plain-text reader would report that a presentable file is "not text"; claiming it lets the body name the real reason and the fix.

<a id="how-it-renders"></a>
## How it renders

- **Container** — `zip.ts` reads the OPC package from its central directory and inflates entries with `DecompressionStream('deflate-raw')`, so the package takes no ZIP dependency. Entries decompress on first read, and a part that claims, or a package that accumulates, more inflation than the reader's caps allow is refused rather than allocated.
- **Graph** — `rels.ts` resolves relationship targets against the part that declares them; `deck.ts` walks presentation → slide → layout → master → theme, resolving each layout through the master its own relationships declare. Every master carries its own theme, so a deck that switches design per section keeps each section's colours and fonts.
- **Shapes** — `shapes.ts` folds the shape's own properties, the theme style matrix referenced by `p:style`, and the layout/master placeholder it inherits from into absolute-pixel shapes. Group children are flattened into slide coordinates. Freeform `a:custGeom` art projects to a CSS `path()` clip at the shape's pixel size, charts and SmartArt draw from the cached fallback picture Office embedded beside them, and the non-placeholder shapes of the master and layout beneath a slide — logos, decorative bars — paint ahead of the slide's own shapes (`showMasterSp="0"` suppresses the master layer), and the footer, date, and slide-number placeholders draw when `p:hf` enables them, folding per slide so the number field carries the real position.
- **Text** — `text.ts` assembles each run from the presentation or master text style, the layout placeholder's list style, the shape's list style, the paragraph properties, and the run properties, in that order. Percentage line spacing renders as a multiple, exact `spcPts` spacing as a pixel height, a percent bullet sizes against its own run, and a frame stating `numCol` flows its paragraphs across that many columns. A run carrying `a:hlinkClick` keeps its link — an internal slide jump navigates the preview, a web or mail target opens externally — and an unstyled link paints in the theme's hlink colour, underlined.
- **Presentation** — `render/` draws the model with absolutely positioned elements, painting each shape on a layer beneath its text frame so a preset outline clips the fill without clipping the paragraph that overflows it. On a clipped outline the stroke draws along the geometry as a second colour band rather than a box border, connectors grow the arrowheads their line names, and a table whose cells state no fill receives the default Office look — accent header, tinted banding — derived from the theme.

Media parts become Blob URLs created with the parsed deck and revoked with the effect that produced it, so switching files or closing the tab cannot leak them; a parse that fails after media resolution revokes them itself.

<a id="interaction"></a>
## Interaction

The rail lists every slide in presentation order with a live thumbnail; the selected slide carries `aria-selected` and a brand-coloured frame, and slides the presentation marks hidden carry a badge. Thumbnails mount lazily through one shared IntersectionObserver, so a hundred-slide deck keeps only the approaching slides' element trees alive. The toolbar steps to the previous or next slide, zooms out and in by one step, reads the current scale, returns to `1:1`, and toggles the window-fitting scale; Ctrl+wheel zooms in finer steps around the viewport centre. Stepping from the toolbar or keyboard scrolls the selected thumbnail into view. `ArrowUp`/`ArrowDown`, `ArrowLeft`/`ArrowRight`, `PageUp`, `PageDown`, `Home`, and `End` move through the slides while the stage holds focus; `+`/`-` step the zoom and `0` returns to `1:1`. Speaker notes appear under the stage when the selected slide has any.

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Legacy `.ppt` is explained, not drawn.** The PowerPoint 97–2003 binary format is a different container entirely; the body reports it and names the fix instead of showing an empty canvas.
- **Charts, SmartArt, and equations draw from their cached fallback.** Office embeds a rendered picture beside each of these frames; the preview shows that image at the frame's position and size. A frame that ships no fallback still renders as a labelled placeholder. Drawing the live model behind the image is a separate body of work with its own fidelity budget.
- **Editing is text-and-notes.** In-place editing covers shape text and speaker notes; moving or resizing shapes, adding shapes, masters, and revision history remain out of scope.
- **Pictures the browser cannot decode render as labelled placeholders.** EMF and WMF metafiles keep their frame and say so instead of disappearing.
- **Some geometry presets still fall back to a rectangle.** Freeform paths, polygons, corner radii (including the two-corner variants), ellipses, pie and chord regions, full rings, bent bands, and connectors draw with their real outline; the open `arc` curve, `teardrop`, and the adjustment values of the fixed polygons do not.
- **Text is not shape-fitted.** `normAutofit`'s `fontScale` is applied, but a paragraph that overflows its box is not re-broken the way PowerPoint's text fitter would.
- **Table style roles beyond fills and borders are approximate.** The presentation's `tableStyles.xml` is resolved, so a styled table keeps its exact per-role fills and borders — including scheme colours modified per role. Text emphasis on dark headers is inferred from the fill's luminance rather than read from the style, and column band counts always use one.
- **Internal slide jumps navigate the preview.** A link authored as a jump to another slide moves the preview to it, on the stage and in the rail; web and mail links open externally; other schemes and a missing target render as plain text, and a date field shows the value the producer cached rather than the current date.
- **WordArt outlines, glows, and reflections are not rendered.** Bold/italic/strike, underlines including wavy and double, run shadows, highlight, and baseline shifts draw; gradient fills on text and the remaining effects do not. Shape shadows read their real direction, distance, blur, and colour.
- **Embedded fonts are not rendered, and animations are not document content.** Non-theme fonts fall back to the browser font stack; animation is playback-time behaviour, not document content.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The renderer is deliberately a subset, chosen from what ordinary business decks contain rather than from the schema. `render/` and `pptx/` are presentation-agnostic: nothing in either imports Cordis, a slot, or another plugin. Test fixtures build their ZIP containers in code (`tests/zip-fixture.ts`) so no binary test data is needed and every container variation is expressible as a test input.

</details>

**Runtime invariant:** No companion is published. The parse is a pure function from package bytes to a model, and the viewing state belongs to the declared Slot store; there is no second independent observation to compare against. Registration disposal and the Blob URL lifetime are covered by behavior tests.
