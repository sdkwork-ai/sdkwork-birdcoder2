# Agent Note: The PDF preview reads pdf.js 6's text-layer contract and catches up to the office family

Status: implemented

English | [中文](2026-09-10-sdkwork-pdf-preview-office-fidelity-round.zh.md)

## Problem

The first commercial-alignment regression of the PDF preview — measured against the docx and pptx siblings and against any usable reader — found six classes of gaps. The text layer CSS was written for pdf.js's old inline-transform spans, but pdf.js 6's `TextLayer` sizes the layer and its glyph runs from a `--total-scale-factor` variable plus viewer-stylesheet rules this package never shipped, so selection and copy did not land on the glyphs, `markedContent` wrappers took absolute positions and broke layout, and rotated text never matched the raster. The thumbnail scale divided the page's point width by the point-to-pixel factor instead of multiplying it, so every thumbnail drew a third too large and was then squashed by `max-width` with its height unclamped — distorted aspect on every page. A worker that never posted its ready message (a CSP-blocked Blob URL, an unsupported module worker) left the body on a spinner forever, because boot never settled. After a fatal worker failure, teardown rejected the load with an unrelated abort error that overwrote the worker explanation the reader had just been shown. Fit was clamped at 100%, so a small page never filled the window, unlike the office previews. And the interaction surface had no unlock for encrypted documents, no page entry, no Home/End or zoom chords, no wheel zoom, no scroll reset on page change, while thumbnails kept every page's raster alive for the life of the document.

## Decision

One round, inside the existing runtime/page/body split, with no new dependency:

- **The text layer implements pdf.js 6's stylesheet contract.** `renderPdfPage` sets `--total-scale-factor` to the render viewport's scale before constructing `TextLayer`; the module CSS mirrors the official viewer rules — variable-derived glyph sizes, `rotate`/`scaleX`/`scale` transforms, `.markedContent { display: contents }`, selection colours — and maps the unrotated layer box onto the rotated page with the `data-main-rotation` transforms the official CSS applies.
- **Thumbnails scale from the page's own size and recycle.** The scale derives from a scale-1 viewport (the point size), fixing the distortion. A two-way IntersectionObserver draws on entry and releases the raster on exit, so a several-hundred-page document keeps only the visible pages' pixels; rail entries add `content-visibility`.
- **Worker boot settles.** The ready message, a worker error, a message error, an abort of the owning signal, and a 15-second deadline all resolve the boot promise; a failed boot terminates the worker and revokes its Blob URL. A fatal worker failure is remembered and rethrown as the load's rejection, so teardown's abort error can never overwrite the reader's explanation, and a synchronous second crash reports once.
- **Encrypted documents unlock in place.** `getDocument` takes an optional `password`; a password failure renders a form that reopens the same bytes, distinguishing "locked" from "wrong password", with `Cancel` returning to the locked state. A new byte identity starts unlocked.
- **Interaction alignment with the office family.** Fit scales small pages up (the 100% cap is gone); the page entry jumps on `Enter` or blur and reverts on `Escape` or malformed input; `Home`/`End` jump to the ends and `Ctrl`/`Cmd` with `=`/`-`/`0` zoom or return to fit; `Ctrl`/`Cmd` plus a wheel notch zooms around the pointer through a native non-passive listener, while button zooms anchor at the viewport centre — a commit-time layout effect re-anchors the viewport around the captured point, and page changes land on the page top with the selected thumbnail scrolled into view. The copy handler strips PDF NUL padding from the selection. Zoom keys work plain, matching the office family, and under Ctrl/Cmd, matching desktop readers.
- **The inlined asset table decodes each resource once per document** and hands out copies, so a CJK document stops re-decoding the same character map on every request.
- **The raster swaps in atomically.** Every page paints off-screen and is blitted into the visible canvas on completion, so zooming and rotating never flash the page blank and an aborted render never leaves a torn page behind.

## Alternatives considered

**Bundle pdf.js's viewer module (`TextLayerBuilder`, `pdf_viewer.css`) for the text layer.** It would bring the official styles and the `endOfContent` selection machinery for free, at the cost of pulling the whole viewer module into the sidebar bundle for a stylesheet contract this package can scope into its own CSS; the package replicates the handful of rules instead.

**Retry passwords through pdf.js's `onPassword` callback.** A React-driven prompt inside the worker callback couples the runtime to component state; reopening complete bytes with the `password` option is stateless, cheap, and testable end to end.

**Tile-based rendering to lift the raster cap.** The 16.7-megapixel cap only softens extreme zooms; a tiled rendering surface is a standalone project and would not change any behaviour this round fixes.

## Consequences

Selection, copy, and rotation land on the glyphs the reader sees on any page, rotated or not; thumbnails keep their aspect and memory tracks what is visible; a broken worker fails loud with the reader's sentence instead of a spinner or a teardown message; an encrypted document unlocks without leaving the tab; keyboard and wheel behaviour matches the office family. Coverage pins every new behaviour at the repository's per-file 100% gate across six specs (body, registration, runtime, page, assets, and the real-parse integration suite that runs the genuine PDF.js parser over generated fixtures to pin the point-size and text-extraction contracts the renderer derives from). The known-limitations lists in both READMEs keep the standing gaps: annotations and form fields are not drawn, there is no find-in-document, and rendering remains one page at a time.
