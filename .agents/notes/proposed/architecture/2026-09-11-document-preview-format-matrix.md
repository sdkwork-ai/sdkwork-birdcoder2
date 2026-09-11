# Agent Note: the remaining document formats and what each would cost

Status: proposed

English | [中文](2026-09-11-document-preview-format-matrix.zh.md)

## Problem

Seven previews now ship on one foundation — PowerPoint, Word, Excel, PDF, images, video, and audio — covering the implemented Agent Note *the SDKWork document previews share one OOXML foundation*. A reader can still open a file this fork does not render and get the plain-text failure that started the work.

Deciding what to build next needs two things this tree does not record: which formats remain, and what each would actually cost. "Support all of Office" is not a plan, because the formats that remain are not variations of the ones that shipped. `.xlsx` and `.xls` differ as much as the ZIP format and a 1990s compound-file record format; `.ods` shares the OOXML container and none of its schema; `.pst` is a mailbox database rather than a document.

The gap to "commercially viable" is also not one gap. Two factors move independently: **fidelity**, meaning how much of the format a renderer draws before a reader notices something missing, and **coverage**, meaning how many of the files a real user opens. The seven shipped previews are honest about both in their package READMEs, and this note extends that.

## Proposal

### The format matrix

Every remaining Office-family format, with the work each needs and the reason it is in its tier.

**Tier A — the same foundation, a new schema (weeks each).**

| Format | Container | Work |
| :-- | :-- | :-- |
| `.odt`, `.ods`, `.odp` | ODF: ZIP plus XML, like OOXML | A different style model (automatic vs named styles, `style:family` rather than `p:sp`/`w:p`), a different numbering model, and `meta.xml` for tags. The container, relationship, and theme reads are already shared. |
| `.vsdx` | ZIP plus XML | A page-and-shape model with a master/instance split. No text-runs cascade, so it is smaller than WordprocessingML. |
| `.xlsb` | ZIP, but binary records | The container is already read; the sheet, style, and string tables are BIFF12 records instead of XML. A new parser over existing geometry. |

**Tier B — a separate binary parser per format (a project each, with a go/no-go).**

| Format | Why it is not a variation |
| :-- | :-- |
| `.doc`, `.xls`, `.ppt` | OLE2 compound files holding the 1997 binary record formats. Each is its own specification: a Word binary table stream and piece table, a BIFF8 workbook, a PowerPoint record stream. Nothing in the shared foundation applies below the container. |
| `.vsd`, `.pub`, `.one`, `.mpp` | The same class of problem in a different product, with less public tooling to verify a parser against. |
| `.rtf` | Text-based, so no container work, but its own control-word grammar and its own layout model. |
| APE, DSD, WMA, AMR audio; WMV, AVI video | Already explained rather than drawn. Playing them would mean a decoder, not a parser: none is a container problem. |

**Tier C — not a rendering problem.**

| Format | Why it is out of scope for a preview |
| :-- | :-- |
| `.pst`, `.ost`, `.msg` | Mailbox stores and message files. The useful feature is a mail reader over a database, not a page renderer. |
| `.accdb`, `.mdb` | A database engine and a query surface. |

### What "commercially viable" still requires

Beyond new formats, the shipped previews need work before they would survive a commercial user. Listed by what a user notices first:

1. **Word pagination.** The renderer packs whole blocks and never splits a paragraph or table across pages, and its measurement path is exercised only in its degraded mode. A paginated word processor that breaks pages differently from Word is the most visible fidelity gap in the family.
2. **Excel virtualization and formula display.** The grid mounts every populated row, and conditional formatting is not evaluated.
3. **PowerPoint chart and SmartArt coverage.** Both draw as labelled placeholders today.
4. **Audio waveform.** The seek surface is a plain slider; a decoded waveform is what a reader navigates by.
5. **PDF annotations and encrypted files.** Form widgets and annotation appearances are not composed, and there is no password prompt.
6. **Video subtitles and track selection.**
7. **The shared view shell.** The body lifecycle is duplicated across seven components and keeps `pnpm run duplication` red.
8. **A visual regression corpus.** The previews are verified against real encoder output per parser, but nothing compares a rendered page against Word, Excel, or PowerPoint output for the same file.
9. **Adversarial input.** No preview has been fuzzed. The OOXML parsers walk attacker-controlled structures and so far have only been given well-formed files.

### Suggested order

1. **The shared view shell**, because every later change touches all seven components and the duplication gate is the tree's only red quality signal.
2. **The fidelity gaps inside what already ships** — Word pagination first, then the Excel grid, then the PowerPoint chart placeholder — because they affect files users already open.
3. **Tier A formats** in order `.ods`/`.odt`/`.odp`, then `.xlsb`, then `.vsdx`, since each reuses the whole foundation and the ODF trio shares one schema family.
4. **A visual regression corpus** before any Tier B format, because a binary-format parser with no reference output cannot be judged correct.

Tier B is where the cost stops being predictable. `.doc`, `.xls`, and `.ppt` are each comparable in size to everything in Tiers A and B combined, need their own fixtures from real Office versions, and cannot be verified against a specification alone. They should be decided one at a time, with the go/no-go on a single format before the next.

## Acceptance criteria

Each step is done when it is verifiable without reading the implementation:

1. **The shared view shell** — the seven preview bodies compose one shell component, `pnpm run duplication` reports no clones between them, and every existing preview spec still passes unchanged.
2. **Word pagination** — a document whose blocks cross a page boundary breaks pages at the same points Word does for a corpus of real documents, and the measurement path runs in a real browser rather than only in its degraded mode.
3. **Excel virtualization** — a sheet with tens of thousands of populated rows scrolls without mounting every row, and the grid still renders the same cells.
4. **An ODF format** — the new preview identifies the container, reads its tags, and renders its text and styles, with a spec over files LibreOffice wrote.
5. **The visual regression corpus** — for each shipped format, a fixture whose rendered page is compared against reference output produced by the corresponding Office application, and a documented tolerance.

## Risks

**Binary formats may cost more than they return.** Tier B's parsers cannot be verified against a specification alone, and a partial rendering of `.doc` may be less useful to a reader than the accurate conversion message that format gets today. This is why each is a separate go/no-go rather than a phase.

**Fidelity gaps may be the whole value.** A Word preview that breaks pages differently from Word is worse than no preview for anyone comparing output. The plan therefore puts the existing formats ahead of new ones, and the visual corpus ahead of any Tier B work.

**The foundation may not stretch to ODF.** The shared library was built from three OOXML formats; ODF shares the container and the relationship graph but not the style or numbering models. If the shared layer turns out to fit ODF poorly, the honest outcome is a second small library rather than a widened abstraction over both.

**The corpus becomes a maintenance burden.** Reference output from Office applications must be regenerated when fixtures change, and it is only meaningful on the platform that produced it.

## Alternatives considered

**Build every format, in file-extension order.** Extension order puts `.doc` next to `.docx`, which hides that the two have nothing in common. It would spend the budget on the least predictable work first.

**Render nothing that cannot be drawn perfectly.** The previews already refuse to *draw* formats they cannot render; refusing to *claim* them would restore the plain-text failure for files whose only problem is a conversion the reader could do. Explaining is strictly better than mis-explaining.

**One universal viewer via a WASM office engine.** Rejected in the family note: commercial licence, tens of megabytes, and `SharedArrayBuffer` isolation requirements for a preview that must work offline in an existing tab.

**Leave Tier B undecided until a user asks.** Reasonable, and it is what this note proposes: the tiers exist so the decision is made per format with its cost visible, not inferred from a promise to "support Office".

## Consequences

If this plan is followed, the tree gains ODF and the binary Office containers as separate, verifiable pieces of work, and the seven shipped previews become trustworthy for the files they already claim.

What is not promised: any timeline, and any claim that a preview draws a format the way Office does. Every renderer in this family is a bounded subset with its gaps written down, and the visual regression corpus in step 4 is what would turn "bounded" into "measured".

The decisions this note does not make are the Tier B go/no-gos. Each needs its own Agent Note, its own fixtures from real Office output, and its own answer about whether a partial rendering of a 1997 binary format is worth more to a reader than an accurate "convert this file" message — which is what every one of those formats gets today.
