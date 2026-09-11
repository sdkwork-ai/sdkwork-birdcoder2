---
description: "PDF previews in the right Sidebar: a page rail, a selectable text layer over a zoomable page canvas, and page navigation, rendered offline by a PDF.js worker this package owns."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-pdf-preview

English | [中文](README.zh.md)

## Summary

Draws `.pdf` documents in the right Sidebar's document tab. The package claims the PDF suffix in the document registry, then contributes the keyed body that renders the document as a continuous, lazily drawn strip beside a page rail, with page navigation, rotation, zoom, find-in-document, and a text layer that can be selected and copied. Rendering happens in the browser from the bytes the document owner already read, through a PDF.js worker and inlined font and image assets that this package owns, so nothing is uploaded and no request leaves the browser.

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

- **Renderer metadata** — `ctx.documentPreviews.register(...)` with id `@deepseek-ai/dsh-client-ui-sdkwork-pdf-preview/pdf`, suffix `pdf`, and `loading: 'bytes-complete'`. Leaving `priority` unset puts the registration in the `extension` band, which outranks the builtin band; the document owner still lists every candidate for a suffix in its viewer menu, so the builtin reader stays reachable rather than being replaced. `bytes-complete` makes the owner call its existing `readAll` path, so this package performs no file read of its own.
- **The body** — the keyed `sidebar.right.tab.document` seat under that same id, in the Session-scoped store declared by the registration. The body owns everything inside the tab below the document toolbar, and the stage element is the renderer's scrollport.

<a id="how-it-renders"></a>
## How it renders

- **A worker this package owns.** A dynamic client bundle has no module URL, so the PDF.js worker source is inlined at build time, started as a module Worker from a Blob URL, and adapted to PDF.js through an explicit port. A worker that fails to start, or that misses its ready deadline, fails the open with a renderer explanation instead of spinning forever; a worker that stops after opening keeps its reason through teardown.
- **Assets that never hit the network.** PDF.js asks for character maps, standard font programs, and its image decoder while parsing. This build inlines those files and answers every request from the inlined table, so CJK text and non-embedded standard fonts render offline. Each request is decoded once per document and handed out as a copy.
- **One viewport, two layers.** The canvas is sized in device pixels while its CSS box stays in the page's own dimensions, so zoom stays crisp without changing layout size; the text layer implements PDF.js 6's stylesheet contract, including the rotated-page transforms, so selection and copy land on the glyphs the reader sees.
- **The raster swaps in atomically.** Every page paints off-screen and is blitted into the visible canvas on completion, so zooming and rotating never flash the page blank and an aborted render never leaves a torn page behind.
- **Rotation is applied to the viewport**, not by spinning the element, so the text layer rotates with the page.
- **Licence disclosure.** The client artifact carries the bundled PDF.js and asset licences as a header banner, so the distributed browser code states what it contains.

One worker and one document are owned per byte identity and released with the effect that opened them, so switching files or closing the tab cannot leave a worker or a Blob URL behind.

<a id="interaction"></a>
## Interaction

The document reads as one continuous strip: every page frames in reading order, the pages near the viewport draw (and redraw at the current zoom and rotation), and pages that scroll far away release their raster. The rail shows one thumbnail per page, drawn once it scrolls into view and released when it leaves, with the selected page marked by `aria-selected` and a brand-coloured frame; the selected thumbnail follows page changes, and scrolling moves the selection to the page under the viewport centre. The toolbar carries a page entry (type a page and press `Enter`, or blur, to jump; `Escape` reverts), page steps, 90° rotation either way, one-step zoom out and in, `1:1`, and the window-fitting scale whose button doubles as the zoom readout — fitting scales small pages up, like the office previews. Stepping pages scrolls the strip to that page's top, `Home`/`End` jump to the ends; `+`/`=` and `-`/`_` step zoom and `0` returns to fit — plain or under `Ctrl`/`Cmd` — and `Ctrl`/`Cmd` plus a wheel notch zooms around the pointer while a plain wheel still scrolls. A page change lands on the page's top; a zoom keeps the anchored strip position in view. The find box scans every page case-insensitively as you type, reports the match count, and its arrows walk the matches in reading order — the active match opens its page and is highlighted on the canvas, with the other matches on their pages dimmer. Text on the page can be selected and copied, and the copied text is stripped of PDF padding characters. An encrypted document unlocks in place: the failure line becomes a password form, a wrong password explains itself, and `Cancel` returns to the locked state.

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Annotations, form fields, and signatures are not drawn.** The page raster and its text layer render; widgets and annotation appearances are not composed over them, so a filled-in form shows its flattened page content only.
- **Matching is case-insensitive and per run.** The finder ignores diacritic folding and matches that cross a style change highlight only their first run; the highlight bands are proportional to the matched characters, not measured glyph boxes.
- **Rendering is lazy, not virtualised.** Pages near the viewport rasterise and release as the reader scrolls, which keeps memory bounded, but a page whose aspect differs from page 1 lays out at page 1's size until its own first draw, and there is no spread (two-page) view.
- **The client artifact is large.** The inlined worker, character maps, standard fonts, and image decoder make the bundle roughly 6.5 MB, which the shell loads with the plugin rather than on first use.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`pdf/runtime.ts` owns the worker, the port bridge, and teardown; `pdf/page.ts` owns rasterisation and the text layer and is the only place that touches a canvas. `pdf/assets.ts` is the table PDF.js calls into. `tsdown.config.ts` is what makes an offline preview possible: it inlines the worker source, defines the asset table, and prepends the licence banner — the three move together with the PDF.js version.

</details>

**Runtime invariant:** No companion is published. Rendering is delegated to PDF.js, whose output this package does not re-derive; the package's own contracts are the worker lifetime, which is covered by behavior tests, and the registration precedence over the builtin reader, covered by the registration spec.
