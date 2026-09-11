# Agent Note: PowerPoint presentations render in the document tab

Status: implemented

English | [中文](2026-09-10-sdkwork-pptx-preview-ooxml-renderer.zh.md)

## Problem

A `.pptx` file opened in the right Sidebar showed "非文本文件，暂时无法预览". No document renderer claimed the suffix, so [Document preview](2026-09-08-document-preview-operations.md) fell back to the plain-text reader, whose `text-pages` mode asks the Host for a line-oriented read of a ZIP container; the Host refuses that with `workspace-file/not-text`. The file was presentable and the message said it was not.

The seam for this already existed — a `DocumentPreviewDefinition` plus a keyed body — but no permissively licensed, offline, client-side renderer was available to put behind it. Every candidate either needs a server (OnlyOffice, Collabora), needs a commercial licence and tens of megabytes of WASM (LibreOffice/ZetaOffice), needs the file on a public URL (Microsoft's viewer), or is a partial DOM renderer with no React component and an unverifiable licence.

## Decision

The fork ships its own renderer as `@deepseek-ai/dsh-client-ui-sdkwork-pptx-preview`, a browser-only client plugin that is a document implementation rather than a Sidebar tab type. It registers a `DocumentPreviewDefinition` (`pptx`, `pptm`, `ppsx`, `potx`, `ppt`; `loading: 'bytes-complete'`; no `priority`, so it stays in the `extension` band that outranks builtins) and the matching keyed body in `sidebar.right.tab.document`. The document owner keeps the tab, the read, the toolbar, and the viewer menu; `bytes-complete` routes it through the `readAll` path it already had, so the package performs no file read and adds no RPC.

Parsing is a pure function from package bytes to a render model, and rendering is a pure projection of that model:

- The OPC container reader, XML access, relationship resolution, theme reading, colour resolution, and unit conversion live in the shared [document preview foundation](2026-09-11-sdkwork-document-preview-family-shared-foundation.md), `@deepseek-ai/dsh-client-sdkwork-office`; this package imports them and owns only the PresentationML work above them.
- `deck.ts` walks presentation → slide → layout → master → theme once per slide and hands the shape reader a resolved context: the colour map in force, the theme's scheme and typefaces, the master's title/body/other text styles, the presentation default text style, and placeholder lookups that fall back from layout to master.
- `shapes.ts` folds three sources into absolute-pixel shapes: the shape's own properties, the theme style matrix referenced by `p:style`, and the placeholder it inherits geometry and list style from. Group children are flattened into slide coordinates, so rendering needs no transform stack. A `p:ph` with no `type` is a body placeholder, which is what makes a content placeholder inherit the body style's bullets.
- `text.ts` assembles each run from the master text style, the layout placeholder's list style, the shape's list style, the paragraph properties, and the run properties, in that order.
- `render/` draws with absolutely positioned elements at CSS pixels (`1 px = 9525 EMU`). Each shape paints on a layer beneath its text frame, so a preset outline clips the fill without clipping the paragraph that overflows it, and the table view places cells absolutely from the file's column widths and row heights so `gridSpan` and `rowSpan` regions land exactly.

Media parts become Blob URLs created alongside the parse and revoked by the same effect, so switching files or closing the tab cannot leak them. The body shows a thumbnail rail beside the selected slide, with slide stepping, zoom steps, a fit toggle, keyboard stepping, and speaker notes; the selected slide and zoom live in the registration's tab-bucketed store so they survive body remounts.

`ppt` is claimed even though the legacy binary format cannot be drawn. Leaving it unclaimed would keep routing it to the plain-text reader and reporting "not text" for a presentable file; claiming it lets the body name the real reason and the fix.

## Alternatives considered

**Base on an existing library.** `pptxjs`, `pptx-preview`, `@js-preview/pptx`, `@vue-office/pptx`, and `@file-viewer/pptx` are the permissive candidates. All are partial DOM renderers with no SmartArt and no React component; several could not have their licences verified from this environment. Starting from one would still leave the inheritance chain, which is where most visible fidelity lives, unimplemented — the feature would ship the same work with an extra dependency and a licence banner.

**A WASM office engine.** ZetaOffice and LibreOffice-WASM reach near-perfect fidelity but carry a commercial licence and tens of megabytes of binary, with `SharedArrayBuffer` isolation requirements. A preview that must work offline inside the existing tab cannot pay that.

**A document server.** OnlyOffice (AGPL or commercial) and Collabora require a server, and would send the user's file off the machine for a read the browser can already do.

**Register a `ppt`-only or no-`ppt` definition.** Claiming `.ppt` without a renderer, or not claiming it, both leave the misleading plain-text failure in place.

**A new Sidebar tab type instead of a document renderer.** That would duplicate the tab, the file read, the toolbar, the wrap control, and the renderer menu that the document owner already provides, and it would lose the per-extension renderer switching that already works.

## Consequences

Clicking a `.pptx` in the Files tree renders it in place: the rail lists the slides, the canvas shows the selected one at its recorded size, and zoom, stepping, notes, and keyboard navigation work without leaving the tab. The change is additive — the document owner, its registry contract, and every existing renderer are untouched — so the fork rule about `ui-sdkwork-*` naming keeps it merge-stable.

Coverage lives in `tests/`: `zip.client.spec.ts`, `pptx-parse.client.spec.ts`, `render.client.spec.tsx`, `registration.client.spec.ts`, and `pptx-body.client.spec.tsx`. Fixtures build their ZIP containers in code, so the package carries no binary test data and every container variation is a test input.

The renderer is deliberately a subset, stated in the package README's limitations: charts, SmartArt, and media frames draw as labelled placeholders; preset geometries outside the projected set fall back to a rectangle at the right position and size; `normAutofit` scale applies but text is not re-broken to fit; tables that rely purely on `tableStyles.xml` get the renderer's own header and banding; equations draw as their fallback text; legacy `.ppt` is explained rather than drawn.

Two repository gates were already red in this working tree before the change and are unrelated to it: `verify-client-ui-i18n` reports 52 hard-coded strings in other `ui-sdkwork-*` packages, and `verify-client-catalog` aborts on a duplicate slot declaration found in a stale `slots.d.ts` left inside `packages/client/ui-sidebar/src/` and on an unexported owner-props interface in `ui-trajectory`. Because that generator aborts during collection, its generated `slot-catalog.ts` could not be regenerated for this package's new occupant of `sidebar.right.tab.document`; the file must be regenerated once those two pre-existing conditions are cleared.
