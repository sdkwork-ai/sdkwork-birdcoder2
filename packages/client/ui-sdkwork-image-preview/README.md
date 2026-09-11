---
description: "Image previews in the right Sidebar: format identification from the bytes, a tab-scoped zoom and rotation stage, image metadata, and a baseline TIFF decoder for the formats browsers do not read."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-image-preview

English | [中文](README.zh.md)

## Summary

Draws images in the right Sidebar's document tab. The package claims a wide set of image suffixes in the document registry, identifies the format from the file's leading bytes, and contributes the keyed body that shows the image on a zoomable, rotatable stage with the file's facts beneath it. Formats the browser decodes are shown directly, which preserves animation; gzipped SVG is inflated once; TIFF is decoded here, orientation included; a format that needs a decoder this preview does not have is explained by name and by the conversion a reader needs. Every decode and inflate is bounded.

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

- **Renderer metadata** — `ctx.documentPreviews.register(...)` with id `@deepseek-ai/dsh-client-ui-sdkwork-image-preview/image`, `loading: 'bytes-complete'`, and more than forty suffixes. Leaving `priority` unset puts the registration in the `extension` band, which outranks the builtin band, so this preview takes the eight suffixes the builtin image reader also claims while leaving that reader selectable in the viewer menu. Its own title is `Image viewer`, distinct from that reader's `Image`, because the menu lists both candidates for a suffix and two identical names would leave a reader unable to tell them apart.
- **The body** — the keyed `sidebar.right.tab.document` seat under that same id, in the plugin-local tab-scoped store declared by the registration. The stage element is the renderer's scrollport.
- **A wider claim than the builtin.** HEIF, JPEG 2000, JPEG XL, PSD, RAW, OpenEXR, Radiance HDR, DDS, Targa, ICNS, EPS, Netpbm, QOI, and XPM/XBM are claimed even though this preview cannot draw them. Unclaimed, they would fall through to the plain-text reader and be reported as "not text"; claimed, the body names the format the bytes actually are and the way to convert it.

<a id="how-it-renders"></a>
## How it renders

- **The bytes decide the format.** A signature match wins over the suffix, so a JPEG named `.png` renders as a JPEG and an unrecognized signature falls back to what the suffix claimed. SVG is text, so its root element is searched rather than matched at an offset, which finds it behind an XML declaration or a leading comment. A gzip signature is decisive on its own, which is how a `.svgz` is recognized whatever it is named.
- **One render path.** Whatever the format, the preview ends up with one Blob URL and the pixel dimensions the browser will draw. A natively decodable format is wrapped directly — which preserves GIF, APNG, and animated WebP — a gzip-wrapped SVG is inflated once, and a decoded TIFF is re-encoded once.
- **Dimensions are measured the way the browser draws them.** Where the platform offers it, `createImageBitmap(..., { imageOrientation: 'from-image' })` supplies the pair, which is the only measurement that accounts for a photo whose orientation lives in EXIF rather than in its pixels: `naturalWidth` reports the stored pixels, and a stage box built from the wrong pair puts the picture outside its own frame. An element measurement is the fallback for a blob the platform will not turn into a bitmap.
- **A baseline TIFF decoder.** TIFF is what scanners and print workflows produce and what browsers refuse. This package reads its image file directories itself: uncompressed, LZW (including TIFF's early-change code width), PackBits, and Deflate, over strips or tiles, in either byte order, for grayscale, RGB, palette, CMYK, and alpha, at 1, 2, 4, 8, and 16 bits per sample, with the horizontal-differencing predictor and the file's own `Orientation` tag applied to the decoded pixels. A TIFF that carries a JPEG preview — which includes the RAW formats built on TIFF — hands those bytes straight to the browser, which decodes JPEG far better than a re-implementation would.
- **Every allocation is bounded.** The pixel budget is 64 megapixels and the per-strip budget is 256 MB, because those numbers come from the file: a directory that claims more is refused by name rather than allowed to ask the tab for gigabytes, and a deflate strip is read through the same budget instead of being buffered whole. A large frame yields to the event loop between strips so the tab keeps answering.
- **One URL, revoked once.** The Blob URL is created with the effect that loaded the bytes and revoked with it, so switching files or closing the tab cannot leak the decoded image.

<a id="interaction"></a>
## Interaction

The toolbar carries the caption — pixel dimensions, format, and file size — plus rotation in quarter turns, the reset, and the zoom group (out, the window-fitting scale that doubles as the readout, `1:1`, in). The stage draws a checkerboard behind the picture so transparency is visible, and the file's facts follow beneath it as a strip: dimensions, format, size, resolution when the file states one, and whether the format can animate. Zoom and rotation are per tab, so returning to a tab restores the view.

The stage is the picture's own viewport. `Ctrl`/`Cmd` with the wheel zooms and holds the point under the pointer in place, a plain wheel still scrolls, dragging pans once the picture is larger than the stage, a double click goes to actual size and back to fitted, and the arrow keys pan. `+`/`=` zooms in, `-` zooms out, and `0` returns to the fitted scale while the stage holds focus. A zoom runs from 5% to 1600%.

A file that cannot be drawn explains itself rather than failing silently: a format without a decoder here and an image past the decode budget are stated as properties of the file, with no retry offered because a second attempt cannot change either, while a damaged file keeps its retry. The explanation names the format and the conversion the reader needs, in the reader's language — the format table carries dictionary keys, never sentences.

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **The formats with no decoder here are explained, not drawn.** HEIF/HEIC, JPEG 2000, JPEG XL, PSD, camera RAW, OpenEXR, Radiance HDR, DDS, Targa, ICNS, EPS, Netpbm, QOI, and XPM/XBM each state their name and the conversion a reader needs. Targa is the awkward one: it has no header signature to identify it by, and the two text-based ones are identified by a searched signature rather than a fixed offset.
- **TIFF coverage is baseline.** JPEG-compressed strips are handled by handing the bytes to the browser, but CCITT group 3 and 4 fax compression, the old-style JPEG (compression 6) tag layout, and separate (planar) sample planes are not decoded; a file using them reports a decode failure rather than a partial image.
- **The decode budget is a refusal, not a downscale.** An image past 64 megapixels, or a strip past 256 MB, is reported by its dimensions and not opened; there is no path here that decodes a large frame at reduced resolution.
- **RAW files show their embedded preview or nothing.** The decoder finds a JPEG preview when the container has one; when it does not, the file is reported as RAW rather than demosaiced.
- **A TIFF whose pixels are an embedded JPEG keeps that JPEG's own orientation.** The file's `Orientation` tag is applied to pixels this decoder produces; on the preview path the browser applies whatever EXIF the embedded JPEG carries, and nothing re-encodes it to force a rotation.
- **No colour management.** CMYK is converted naively, and an embedded ICC profile is ignored, so wide-gamut images may shift.
- **No editing surface.** There is no crop, no colour adjustment, and no frame stepping for an animated image; the animation simply plays.
- **Metadata is structural, not embedded.** Dimensions, format, size, DPI, and animation capability come from the file structure. EXIF camera fields, IPTC captions, and XMP are not read.
- **The TIFF fixtures are Pillow output.** The spec decodes files an independent encoder wrote, including one carrying an `Orientation` tag and one stating its resolution as a rational, but no file produced by a scanner or by Photoshop is in the corpus.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`image/formats.ts` is the identification table and the only place suffixes are named; it states a dictionary key for every format it cannot draw, so no sentence is ever written there. `image/tiff.ts` is the decoder and is self-contained apart from `DecompressionStream`; its budgets and its orientation transform are the two places its input is trusted least. `image/load.ts` is the single place that creates a Blob URL, and therefore the only place that has to revoke one, and the single place that measures what the browser will draw. `tests/make_samples.py` regenerates the fixtures with Pillow; run it after changing the decoder so the specs keep decoding real encoder output.

</details>

**Runtime invariant:** No companion is published. Decoding native formats is delegated to the browser and TIFF decoding is covered by behaviour tests against real encoder output; there is no second independent observation of the same relationship to compare against.
