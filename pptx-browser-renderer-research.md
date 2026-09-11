# Browser-side PPTX rendering libraries — landscape report

Date of research: 2026-02 session. Author: delegated research subagent.

## Verification caveat (read first)

`web_fetch` is unusable in this session: every external hostname resolves to the sandbox DNS
sinkhole (`registry.npmjs.org` -> 198.18.0.132, `github.com` -> 198.18.0.102, `example.com` ->
non-public), and the harness HTTP fetch provider rejects any non-public address
(`packages/web/web-fetch-http/src/policy.ts` + its address check). Direct egress from a shell is
also blocked (TLS connect failure against the sinkhole). Therefore every entry below is built
from `web_search` result metadata (page titles / repository descriptions, which the provider does
return) plus prior model knowledge.

**Confidence legend**
- **[S]** = confirmed by a search result title/URL in this session (existence, description, some versions).
- **[K]** = prior knowledge only; version/license/date need machine verification.

Verify before committing to any dependency, on a machine with open network:

```sh
for p in pptxjs pptx-preview pptxviewjs @js-preview/pptx @vue-office/pptx pptxgenjs jszip \
         fflate docx-preview @aiden0z/pptx-renderer pptx-svg @file-viewer/pptx pptx2json veaury; do
  npm view "$p" version license time.modified repository.url dist.unpackedSize 2>/dev/null
done
```

---

## 1. Candidate-by-candidate

### 1.1 `pptxjs` (meshesha/PPTXjs)

- npm: `pptxjs` — last published line **1.10.2** (tag `V.1.10.2` visible in repo history) **[S]**; effectively dormant since ~2023 **[K]**.
- License: **MIT** (repo carries a LICENSE file) **[K — verify]**; bundling jQuery/JSZip/d3 is MIT-compatible.
- Fidelity: **partial, legacy**. jQuery plugin; unzips the OOXML with JSZip and emits absolutely-positioned HTML `<div>`/CSS per slide. Text, solid fills, images, basic tables, some gradients, some chart types via d3. **No real SmartArt support**, weak theme/master/style inheritance, frequent layout drift on complex decks.
- Output: **DOM/HTML** (not SVG, not Canvas).
- Bundle: large for what it does — jQuery (~90 KB) + JSZip (~100 KB) + d3 + plugin core, ~300–500 KB min **[K, approximate]**.
- Client-only Vite/React: works (no server), but **jQuery is required** and there are no types; needs `Buffer`/`process` shims in some setups. No workers/WASM.
- Per-slide rendering: each slide becomes its own container element, so thumbnails are extractable, but it always parses/renders the whole deck.
- Forks seen on npm/GitHub: `pptxjs-modified`, `YinUHung/pptxjs` **[S]**. Long-tail forks have mixed provenance — treat as supply-chain risk.
- **Verdict:** usable only as a parsing reference; fidelity and maintenance are below product quality today.

### 1.2 `pptx-preview` (npm) — the modern jQuery-free DOM renderer

- npm: `pptx-preview`, **≥1.0.7** confirmed via jsDelivr README path **[S]**.
- License: **MIT** **[K — verify]**.
- Fidelity: **partial but the best of the DOM-only family**. TypeScript, renders slides into DOM with a real layout pass: text runs/styles, autoshapes, solid/gradient fills, images, tables, and a hand-rolled chart subset. **SmartArt: no.** Charts embedded as OLE objects are typically skipped or approximated.
- Output: **DOM** (HTML/CSS); no SVG export.
- Bundle: ~150–300 KB min incl. its zip dependency **[K, approximate]**; no jQuery.
- Client-only Vite/React: **yes** — pure browser code; no workers/WASM. Works from an `ArrayBuffer`.
- Per-slide: renders all slides into a scroll container where each slide is a discrete element; you can clone/hide per slide for a thumbnail rail + single-slide view. No official "render slide N" API.
- Downstream wrappers: `@js-preview/pptx` and `@vue-office/pptx` are believed to wrap this engine **[K]**.
- **Verdict:** best MIT starting point if you extend an existing renderer; still short of PowerPoint fidelity.

### 1.3 `pptxviewjs` (npm)

- npm: `pptxviewjs` **[S]** (Snyk/Socket/jsDelivr pages exist).
- License: **unknown/unverified** — no license signal in any result **[K]**.
- Fidelity: unverified; appears to be a pptxjs-family derivative (jQuery-era HTML output).
- **Verdict:** unvetted; do not adopt without reading the repo LICENSE and code.

### 1.4 `jszip` (+ custom OOXML parsing) — the baseline

- npm: `jszip` **3.10.1** **[K]**; License **MIT** (dual MIT/GPLv3 — the MIT option is available) **[K]**.
- Fidelity: **whatever you implement**. A pptx is a ZIP of OOXML parts (`ppt/slides/slideN.xml`, `ppt/slideLayouts`, `ppt/slideMasters`, `ppt/theme`, `ppt/media`, `ppt/charts`, `ppt/diagrams`). You get full control over layout inheritance, theme colours, text metrics and per-slide rendering.
- Output: your choice — DOM, SVG (best fit for crisp thumbnails), or Canvas.
- Bundle: JSZip ~100 KB min / ~30 KB gzip. **`fflate` (MIT, ~10 KB gzip) is the modern smaller/faster alternative** and is what several newer renderers use **[K]**.
- Client-only Vite/React: yes, trivially; runs in-browser, can be moved to a worker for large decks.
- Per-slide: **ideal** — parse the package once into an in-memory model, then render exactly one slide.
- **Verdict:** the only approach that can meet "offline + permissive + per-slide + high fidelity" — at the cost of building the renderer.

### 1.5 `pptxgenjs`

- npm: `pptxgenjs` **4.0.1** (gitbrent/PptxGenJS) **[K]**; License **MIT** **[K]**; actively maintained.
- **Generation only — confirmed.** There is no parse/read/render API; it writes OOXML from a JS object model.
- Bundle: ~500 KB min / ~150 KB gzip (bundles JSZip) **[K, approximate]**.
- **Verdict:** irrelevant for preview — cannot render.

### 1.6 OnlyOffice Document Server

- Not an npm package: a server product (Docker) embedded via its JS API/iframe **[S]** (onlyoffice.com compare-editions; DeepWiki "Editions and Licensing").
- License: **AGPL-3.0** for the Community Edition, with a **paid commercial license** required for non-AGPL/SaaS use.
- Fidelity: near-perfect (real document engine) but rendering happens **server-side**; the browser is a thin client; files leave the client.
- **Verdict:** disqualified — AGPL/commercial + mandatory server + cloud round-trip.

### 1.7 Collabora Online / CODE (and the WASM effort)

- Server product (CODE Docker), **MPL-2.0 core with commercial licensing for the supported builds**, plus a research **WASM target** (`CollaboraOnline/online` `wasm/README`, FOSDEM 2023 talk) **[S]**.
- Fidelity: near-perfect (LibreOffice engine), but the browser path is immature and still huge.
- **Verdict:** disqualified for a client-only app — server-side, mixed licensing, not a drop-in library.

### 1.8 LibreOffice WASM / ZetaOffice / `lowriter` WASM

- **ZetaOffice** (Allotropia, announced Nov 2024; covered by The Register Feb 2025) — LibreOffice + ZetaJS compiled to WASM, runs in the browser **[S]**.
- License: LibreOffice core is MPL-2.0, but **ZetaOffice itself is a commercial product/SDK** — expect a paid license for production use **[K — verify terms]**.
- Fidelity: **highest available client-side** (it is LibreOffice, so layout/charts/SmartArt are essentially native).
- Bundle/runtime: **multi-tens-of-MB WASM**, needs `SharedArrayBuffer` (COOP/COEP headers), workers, and heavy memory; cold start measured in seconds.
- `lowriter`/community libreoffice-wasm builds: experiments, not production-supported.
- **Verdict:** the only true-fidelity offline option, but commercial licensing + enormous bundle rule it out for a lightweight Vite/React thumbnail rail.

### 1.9 `veaury`

- npm: `veaury`; License **MIT** **[K]**. It is a **Vue-in-React (and React-in-Vue) bridge**, not a pptx renderer **[S: repo described as a bridge]**.
- Relevance: the practical way to consume the Vue-only `@vue-office/pptx` component from React.
- **Verdict:** not a renderer; optionally useful as glue.

### 1.10 `@file-viewer/pptx` (flyfish-dev/file-viewer)

- npm family: `@file-viewer/vue3`, `@file-viewer/renderer-*`, `@file-viewer/core`; version line **2.3.x** (`v2.3.0` in CHANGELOG) **[S]**.
- License: **Apache-2.0 — confirmed** (GitHub LICENSE page title reads "Apache License") **[S]**. Permissive, acceptable.
- Fidelity: multi-format preview suite (Office/iWork/etc.). PPTX support is PPTX-specific and **partial** (DOM rendering); it is a general viewer, not a fidelity-focused pptx engine. Vue-first packaging.
- **Verdict:** only permissive-licensed turnkey option found besides the pptx-preview family; verify pptx fidelity against your real decks.

### 1.11 `@js-preview/pptx`

- npm: `@js-preview/pptx` (family: docx, excel, pdf, pptx; `@js-preview/docx` at **1.6.0** seen) **[S]**.
- License: **MIT** per its published metadata **[K — must verify]**. The user explicitly asked: as far as can be established it is **MIT, not GPL/AGPL**.
- Fidelity: framework-agnostic wrapper around a DOM renderer (believed to be `pptx-preview`) → same **partial** fidelity (no SmartArt; chart subset).
- Bundle: modest; client-only; no WASM/workers.
- Per-slide: container-per-slide DOM; thumbnails extractable.
- **Verdict:** likely the most convenient React-friendly permissive option — but confirm the MIT license and its dependency licence chain on npm.

### 1.12 `vue-office` / `@vue-office/pptx`

- npm: `@vue-office/pptx` — versions **0.0.6** and **1.0.0** observed **[S]**; repo `501351981/vue-office` explicitly supports docx/xlsx/xls/pdf/pptx and states it also works with React and other non-Vue frameworks **[S]**.
- License: **MIT** **[K — high confidence; verify]**. Not GPL/AGPL.
- Fidelity: same DOM engine class as pptx-preview → text/shapes/images/tables/some charts, **no SmartArt**, no SVG export.
- React: the package is a Vue component; from React you must mount it imperatively or bridge with `veaury`. The README's "supports React" claim refers to the underlying core, not a React component export.
- **Verdict:** MIT and works offline; if you are not on Vue, `@js-preview/pptx` is the cleaner React fit.

### 1.13 `docx-preview`

- npm: `docx-preview` **~0.3.7** **[S]**; License **MIT**, actively maintained-ish **[K]**.
- **DOCX only.** There is no sibling package for pptx — the pptx analogues are `pptx-preview`/`@js-preview/pptx`/`@vue-office/pptx`.
- **Verdict:** not applicable; useful only as an architectural reference for DOM-based OOXML rendering.

### 1.14 Microsoft Office Online viewer

- Requires the file to be reachable on a **public URL** (or OneDrive/SharePoint); it is an `iframe` into Microsoft's cloud, and Microsoft can read the document.
- **Verdict:** confirmed unsuitable — cannot render local/private files, requires internet and third-party cloud processing.

### 1.15 `pptx-preview`, `pptx2json` family (parsers)

- `pptx2json`, `pptx2json2`, `@arcsin1/pptx2json`, `ppt2json` **[S]**: **parser/serializer only** (pptx → JSON), no rendering at all. Licenses mixed/unverified **[K]**.
- Useful only if you build your own renderer and want a JSON intermediate (though writing your own OOXML walk is usually cleaner than depending on these).

### 1.16 Newer / unvetted entrants found (flag, do not adopt blind)

| Package | Signal |
| --- | --- |
| **`@aiden0z/pptx-renderer`** | **[S]** GitHub `aiden0z/pptx-renderer`: "Browser-native high-fidelity PPTX renderer: parses Office Open XML, renders slides as **HTML/SVG** (187+ shapes, **134+ SmartArt**, 36+ style variants, 100+ python-pptx cases), pixel-level visual regression against PowerPoint output." Fork `@kandiforge/pptx-renderer` exists. **License/version/adoption unverified — highest-upside lead, verify first.** |
| `pptx-svg` (`t-ujiie-g/pptx-svg`) | **[S]** pptx→SVG converter on npm/GitHub; scope and license unverified; appears small/experimental. |
| `@office-kit/pptx-preview`, `@work-zhanguo/pptx-preview`, `react-pptx-preview-kit`, `pptx-kit-preview`, `pptx-browser`, `pptjs`, `ppt-preview`, `@cobuildx.ai/office-viewer`, `web-ppt-editor`, `@lamberl-lee/file-preview` | **[S]** exist on npm only; almost certainly forks/republishes or tiny experiments. Verify publisher identity before use — this namespace is a typosquat/republish hotspot. |

---

## 2. Direct answers

**Does a fully offline, permissively-licensed, high-fidelity DOM/SVG renderer exist today?**
**No.** Nothing on npm today combines (a) permissive license, (b) client-only/no server, (c) PowerPoint-grade fidelity across text/fills/gradients/images/tables/charts/SmartArt, and (d) per-slide rendering, with production maturity.

The fidelity/licence frontier:

| Approach | Offline | Licence | Fidelity | Verdict |
| --- | --- | --- | --- | --- |
| LibreOffice WASM (ZetaOffice) | yes | commercial | ~100% | best fidelity, wrong licence + huge bundle |
| OnlyOffice / Collabora | no (server) | AGPL / commercial | ~100% | disqualified |
| `@aiden0z/pptx-renderer` | yes | **unknown** | claimed high (SVG + SmartArt) | must verify licence/maturity first |
| `pptx-preview` / `@js-preview/pptx` / `@vue-office/pptx` | yes | MIT | partial (no SmartArt) | best pragmatic MIT base |
| `@file-viewer/pptx` | yes | Apache-2.0 | partial | permissive turnkey alternative |
| `pptxjs` | yes | MIT | partial/dated | reference only |
| custom `fflate`/`jszip` + OOXML → SVG | yes | yours | as good as you build it | realistic long-term path |

**Best starting point.** Check `@aiden0z/pptx-renderer` first (10 minutes: clone, read LICENSE, look at commit history, run it against your decks). If its licence is permissive and it is real, it is the only candidate claiming SVG output **with SmartArt**. If not, start from **`pptx-preview`** (MIT, TypeScript, no jQuery, DOM output, framework-agnostic) and, for React, consume it directly or via `@js-preview/pptx`; keep `@vue-office/pptx` for Vue.

**Is a custom OOXML + SVG renderer realistic?** Yes, and it is the only path that satisfies the stated constraints at full strength: `fflate` (MIT, ~10 KB) to unzip, then parse `slideN.xml` + `slideLayout`/`slideMaster`/`theme` for inheritance, resolve `EMU` geometry into an SVG viewBox, render text via `<foreignObject>` or `<text>` with `a:rPr`/`a:pPr` mapping, shapes via `<path>`, fills/gradients via `<linearGradient>`/`<radialGradient>`, images via `<image href=blob:>`, tables via `<rect>`+`<text>`. Charts (`ppt/charts/chartN.xml`) and SmartArt (`ppt/diagrams/dataN.xml` + `drawingN.xml`) are the hard tail and should be scoped as an explicit phase-2 with its own fidelity budget. Per-slide rendering is natural in this design (parse once, render slide N), which is exactly what a thumbnail rail plus selected-slide view needs.

## 3. Sources

- https://github.com/meshesha/PPTXjs (and releases/commit `V.1.10.2`)
- https://github.com/YinUHung/pptxjs
- https://www.npmjs.com/package/pptxviewjs , https://socket.dev/npm/package/pptxviewjs
- https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/README.md
- https://security.snyk.io/package/npm/pptx-preview
- https://github.com/aiden0z/pptx-renderer , https://www.npmjs.com/package/@aiden0z/pptx-renderer
- https://github.com/t-ujiie-g/pptx-svg , https://www.npmjs.com/package/pptx-svg
- https://github.com/501351981/vue-office , https://npm.io/package/@vue-office/pptx/v/0.0.6
- https://security.snyk.io/package/npm/%40js-preview%2Fdocx , https://www.npmjs.com/package/@js-preview/pptx
- https://github.com/flyfish-dev/file-viewer/blob/main/LICENSE (Apache License), https://github.com/flyfish-dev/file-viewer/blob/main/CHANGELOG.md
- https://npm.io/package/docx-preview
- https://www.npmjs.com/package/pptxgenjs , https://raw.githubusercontent.com/gitbrent/PptxGenJS/master/CHANGELOG.md
- https://deepwiki.com/ONLYOFFICE/DocumentServer/3-editions-and-licensing , https://www.onlyoffice.com/compare-editions
- https://github.com/CollaboraOnline/online/blob/master/wasm/README , https://archive.fosdem.org/2023/schedule/event/lotech_coolwasm01/
- https://blog.allotropia.de/2024/11/08/announcing-zetaoffice-a-new-libreoffice-technology-product-for-web-mobile-desktop/ , https://www.theregister.com/software/2025/02/13/libreoffice-goes-collaborative-and-wasm-as-zetaoffice/
- https://www.npmjs.com/package/veaury
- https://npm.io/package/pptx2json2 , https://www.npmjs.com/package/@arcsin1/pptx2json
