# Agent Note: the SDKWork document previews share one OOXML foundation

Status: implemented

English | [中文](2026-09-11-sdkwork-document-preview-family-shared-foundation.zh.md)

## Problem

[The PowerPoint preview](2026-09-10-sdkwork-pptx-preview-ooxml-renderer.md) shipped first and carried its own OPC container reader, XML access, relationship resolution, theme reading, colour resolution, and unit conversion. Every further format the fork wanted — Word, Excel, PDF, images, video, audio — needs some of the same work, and each one forced the same choice:

- **Copy the primitives into each package.** Three copies of `zip.ts`, `xml.ts`, and `rels.ts` triplicate a few hundred lines and fail `pnpm run duplication`, which runs `jscpd` at `minTokens: 60, minLines: 6` over `packages`.
- **Import them from the PowerPoint package.** Forbidden: a feature plugin must not runtime-import another feature plugin's values, and must not declare `dsh.client.external` to obtain them. Shared runtime code belongs only in a narrow static owner such as `client/store`, `ui-primitives`, or a browser-safe utility package.
- **Make each format re-derive them.** That is the same triplication with worse names.

The client bundle's purity gate states the boundary precisely: a value import of a workspace package that is neither a baseline platform module nor inline-safe is a build error, "because a cross-plugin value import either inlines a duplicate runtime instance or requires a specifier the module table cannot answer for this package".

Alongside that, each preview repeated the same body lifecycle — a parse-once-per-bytes effect with disposal, a `ResizeObserver` stage measurement, a fit-scale computation, and the same progress, failure, and retry markup — and that repetition is still the largest clone family in the tree.

## Decision

**One browser-safe library for the primitives, one declaration for the shared viewing state, and a per-format plugin above them.**

`@deepseek-ai/dsh-client-sdkwork-office` (`packages/client/sdkwork-office`) owns the OPC container reader, namespace-aware XML access, relationship resolution, DrawingML colour resolution with its modifier stack, WordprocessingML's `themeTint`/`themeShade` bytes, theme scheme and typefaces, unit conversions across EMU, twips, points, half-points, and eighth-points, container-kind detection, and the per-part relationship read the formats all start from.

It is a library rather than a plugin, and it has **no runtime imports at all** — `pagedViewStore` is a plain declaration the plugin hands to `defineStore`, and every other shared name is reached through `import type`, which is erased. That is what makes the inlining decision honest: there is no identity to share, no `instanceof` across the boundary, no singleton state. It builds through the `staticLinked` preset and each preview bundle inlines its own copy, which required one addition to `INLINE_SAFE` in `packages/client/tsdown.client.ts` — the allowlist whose stated meaning is "contract layers and pure folds a client bundle may inline: browser-safe values with no runtime identity to share".

**`pagedViewStore` covers the paginated viewers only.** Word, Excel, and PowerPoint pages are the same shape — one selected index and one zoom, bucketed by tab — so the declaration is shared. The image and audio players are not paged, and reusing it would have left a dead `index` field; each declares its own store instead, plugin-local until a second consumer needs exactly those fields.

**Each format plugin stays independent.** Every preview is its own `ui-sdkwork-<format>-preview` package that claims its suffixes in `ctx.documentPreviews`, contributes the keyed `sidebar.right.tab.document` body, and owns its renderer. The document owner keeps the tab, the read, the toolbar, and the viewer menu; `loading: 'bytes-complete'` routes each one through the `readAll` path that already existed, so no preview performs a file read or adds an RPC.

**Identification reads the bytes, never the suffix.** Every preview that shipped after PowerPoint identifies the real format from the file's own structure and treats the suffix as a hint: the image preview sniffs signatures so a JPEG named `.png` renders as a JPEG; the video preview walks the ISO box tree, the Matroska EBML tree, the transport stream's program map, and the ASF stream properties object; the audio preview reads the ISO sample description, which is the only way to tell ALAC from AAC inside the same `.m4a`. **Identification is a hint, never a verdict** — the platform codecs decide what plays, so a file that passes identification is still verified by loading it, and a refusal is reported with the container and codec already read from the bytes rather than a bare numeric media error.

**Claim what cannot be drawn.** Every preview claims the suffixes whose formats it recognizes but cannot render — legacy `.ppt`/`.doc`/`.xls`, HEIF, PSD, RAW, AVI, WMV, WMA, and the rest. Unclaimed, those files fall through to the plain-text reader and are reported as "not text", which is the wrong explanation for a presentable file. Claimed, the body names the format and the conversion the reader needs.

## Alternatives considered

**A shared platform module instead of an inlined library.** Adding the library to `PLATFORM_MODULES` with a shell seed import and a Vite alias would give every preview one shared instance. It buys nothing here: the library shares functions and plain data, not identity, so a single instance and seven copies behave identically. It would cost three more wiring surfaces and a synchronous module-table dependency between the previews and the shell.

**Keep the primitives in the PowerPoint package and import them.** Rejected as the feature-plugin rule above requires; the module graph cannot answer a specifier that only one dynamic plugin supplies.

**One preview package with a format switch.** Fewer packages, but it would put the PowerPoint style cascade, the WordprocessingML cascade, and the SpreadsheetML style table in one bundle, and a reader who opens only PDFs would download all three. The per-format package also keeps each renderer's tests, README, and limitations scoped to the format they describe.

**A generic "office document" library with an abstraction over the formats.** OOXML's three formats share the container and relationships and almost nothing above them: a `p:sp` is not a `w:p` is not a `c`. The one shared concept that emerged from building all of them is the paged viewer's state.

**Extract the body lifecycle into a shared view shell now.** That is the remaining duplication and it is real, but it refactors six working packages; it is deferred rather than rejected, and the clone report is the evidence that it is still owed.

## Consequences

Seven previews share one foundation: PowerPoint, Word, Excel, PDF, images, video, and audio. Adding a format whose file is an OPC package with XML now means writing a parser and a renderer, not a container reader.

Every preview is independently verified against files a real encoder produced rather than bytes this repository also authored: Pillow for TIFF, ffmpeg for the video and audio containers, and `.NET`-free hand-checked OOXML fixtures for the office formats. Those fixtures found real defects that a self-authored fixture would have shared: a Theora picture size read from the wrong offset, a transport-stream PSI section start taken from the wrong field, an ASF stream-properties GUID in the wrong byte order, an 8-byte `free` box aborting an entire ISO box walk, and an ALAC file reported as AAC.

The costs are stated rather than hidden. The PDF preview's client artifact is about 6.5 MB because it inlines the PDF.js worker, character maps, standard fonts, and the image decoder, and it carries the licences of all of them as a header banner. The previews render deliberately bounded subsets, each listed in its package README's limitations.

**The duplication gate is still red, and the remainder is the body lifecycle**: 23 clones and about 341 lines across the family, dominated by the parse-once effect, the stage measurement, the fit-scale computation, and the progress and failure markup that every `*Body` or `*Player` component repeats. The extraction is a shared paged-viewer shell; until it exists, the gate reports this debt rather than passing.

Two repository gates were already red in this working tree before the change and are unrelated to it: `verify-client-ui-i18n` reports hard-coded strings in other `ui-sdkwork-*` packages, and `verify-client-catalog` aborts on a duplicate slot declaration left in a stale `slots.d.ts` inside `packages/client/ui-sidebar/src/`. Because that generator aborts during collection, its `slot-catalog.ts` could not be regenerated for the new occupants of `sidebar.right.tab.document`.
