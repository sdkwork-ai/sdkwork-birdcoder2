---
description: "Shared OOXML primitives (OPC container, XML access, relationships, colour, theme, units) and the paged-viewer store declaration behind the SDKWork Word, Excel, and PowerPoint document previews."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-sdkwork-office

English | [中文](README.zh.md)

## Summary

Format-agnostic OOXML plumbing for the SDKWork office document previews. It reads an OPC container from its central directory, parses namespaced XML, resolves relationship targets, resolves DrawingML colours and the theme's colour scheme and typefaces, converts EMU, twips, half-points, and eighth-points to CSS pixels, and declares the tab-scoped page-and-zoom store every paged viewer uses. It registers no plugin and holds no module-level state, so each preview bundle inlines its own copy.

## Table of Contents

- [What it owns](#what-it-owns)
- [Why it is a library, not a plugin](#why-it-is-a-library-not-a-plugin)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-owns"></a>
## What it owns

| Module | Contract |
| :-- | :-- |
| `ooxml/zip.ts` | Reads the OPC container from its central directory and inflates entries with `DecompressionStream('deflate-raw')`. Entries decompress on first read; the ZIP64 extra field and a trailing archive comment are handled. Inflation is capped per entry and per package, so a hostile container's claimed sizes cannot drive unbounded allocation. |
| `ooxml/xml.ts` | Namespace-aware XML access. Direct-child and descendant lookup are separate operations because OOXML reuses local names at different depths. |
| `ooxml/rels.ts` | Resolves a relationship target against the part that declares it, normalizing OPC's leading-slash spelling to the ZIP entry spelling. |
| `ooxml/color.ts` | Resolves a DrawingML colour element against a theme scheme, applying its modifier stack (`alpha`, `lumMod`, `lumOff`, `satMod`, `shade`, `tint`), plus WordprocessingML's `themeTint`/`themeShade` byte modifiers. |
| `ooxml/theme.ts` | Reads `a:theme` into the colour scheme and the major/minor typefaces, with Office's defaults filled in. |
| `ooxml/units.ts` | EMU, twips, points, half-points, and eighth-points to CSS pixels; OOXML angles and percentages. |
| `paged-view.ts` | The `defineStore` declaration for one selected page and zoom level per tab. |

<a id="why-it-is-a-library-not-a-plugin"></a>
## Why it is a library, not a plugin

Three previews need the same container, XML, relationship, colour, and unit handling. Copying it per preview would triplicate the code and fail the repository's clone detection; having one preview import another's values is forbidden, because a feature plugin must collaborate through services and slots rather than through shared module state.

Everything here is a pure function or a class with no cross-boundary identity (no `instanceof` checks over these types, no singletons, no module-level mutable state), which is exactly what the client build's inline-safe allowlist describes. Each preview bundle therefore inlines its own copy, and `pagedViewStore` is a plain declaration the plugin hands to `defineStore`, so this package takes no runtime dependency at all.

<a id="model-experience"></a>
## Model Experience

None, as this package is a browser-side library that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; nothing here reaches a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Only stored and deflate ZIP entries.** OOXML producers emit those two methods; an archive using another method is refused with a named error rather than silently mis-read.
- **DrawingML colour resolution is element-driven.** It resolves `a:srgbClr`, `a:schemeClr`, `a:sysClr`, `a:prstClr`, `a:scrgbClr`, and `a:hslClr` with their modifiers. Format-specific colour syntax stays in the format package — presentation colour maps live in `ui-sdkwork-pptx-preview`, and WordprocessingML's `w:color` attributes in `ui-sdkwork-docx-preview`.
- **No encryption or signing.** An OPC package wrapped in an encrypted (CFB) container, or one whose parts are IRM-protected, is not readable; the readers report it as an unreadable container.
- **No streaming.** A whole package is materialized before parsing. The document owners cap file size, so this is bounded by that cap rather than by this library.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Adding a format package means adding a consumer, not a branch here: nothing in this library switches on part names or document kind. Format-specific relationship suffixes (`/relationships/slide`, `/relationships/header`, …) live in the format package; only `/officeDocument`, `/relationships/theme`, and `/relationships/image` are shared.

</details>

**Runtime invariant:** No companion is published. The functions here are pure transformations of bytes and elements, and their correctness is covered by behavior tests; there is no independent runtime observation to compare against.
