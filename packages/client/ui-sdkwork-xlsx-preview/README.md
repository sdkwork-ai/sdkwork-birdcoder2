---
description: "Spreadsheet previews in the right Sidebar: an offline SpreadsheetML renderer that draws Excel's own window — Name Box, formula bar, sheet tabs, status bar, and an Office-accurate virtualised cell grid — for .xlsx/.xlsm/.xltx/.xltm."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-xlsx-preview

English | [中文](README.zh.md)

## Summary

Open a workbook in the Sidebar and read it the way Excel shows it: the sheet's own fonts, fills, borders, merged regions, frozen panes, and number formats all come through as stored, with no server or converter in the path. The window is Excel's, from the Name Box and formula bar down to the sheet-tab strip and status bar. Select cells and ranges with the keyboard or the pointer and follow a formula through the grid. Only the cells on screen are mounted, so a workbook with a hundred thousand populated rows opens at the cost of the visible ones.

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

- **Renderer metadata** — `ctx.documentPreviews.register(...)` with id `@deepseek-ai/dsh-client-ui-sdkwork-xlsx-preview/xlsx`, suffixes `xlsx`, `xlsm`, `xltx`, `xltm`, `xlsb`, and `xls`, and `loading: 'bytes-complete'`. Leaving `priority` unset puts the registration in the `extension` band, which outranks the builtin band. `bytes-complete` makes the document owner call its existing `readAll` path, so this package performs no file read of its own.
- **The body** — the keyed `sidebar.right.tab.document` seat under that same id, in the Session-scoped store declared by the registration. The body receives `resourceAddress`, `content`, `wrap`, `scrollportRef`, and `useTabInfo`; it owns everything inside the tab below the document toolbar. The worksheet surface is the renderer's scrollport, so the owner restores the previous scroll offset across remounts — and the virtual window starts from that restored offset rather than from the sheet's origin.
- **Shared viewing state** — the selected sheet and the zoom level, bucketed by tab id through the shared `pagedViewStore` declaration, so switching tabs and coming back returns to the same sheet.

`xls` and `xlsb` are claimed deliberately even though the renderer cannot draw them. The legacy BIFF and binary-workbook formats would otherwise fall through to the plain-text reader and report that a presentable file is "not text"; claiming them lets the body name the real reason and the fix.

<a id="how-it-renders"></a>
## How it renders

- **Container and graph** — the shared `@deepseek-ai/dsh-client-sdkwork-office` library reads the OPC package, resolves the workbook's relationships, and reads the theme.
- **Styles** — `styles.ts` composes the parallel `numFmts`, `fonts`, `fills`, and `borders` tables through each cell's `cellXfs` index, resolving `rgb`, `theme` (with Excel's light-first theme order and signed tint), and `indexed` colours.
- **Number formats** — `number-format.ts` implements Excel's format codes: up to four `;`-sections, digit patterns with grouping, scaling, percentages and scientific notation, date and time codes over the workbook's serial numbers (including the 1900 leap-year quirk and the 1904 system), and literal and text sections.
- **Sheets** — `workbook.ts` reads column widths, row heights, merged regions, the frozen pane, hyperlinks, and pictures anchored to the grid, converting character widths and point heights to pixels. It also reads the sheet's own view: whether it paints gridlines, lays out right-to-left, shows its row and column bands, and what zoom it was saved at. Hidden rows and columns are dropped from the visible index rather than laid out at zero size, so the grid never walks a gap.
- **Layout** — `render/geometry.ts` turns that index into cumulative pixel offsets, so the virtual window asks for the offset of its first visible column and walks from there; a sheet that states a height for its hundred-thousandth row costs one array entry, not a hundred thousand.
- **The surface** — `render/SheetGrid.tsx` mounts only the positions the scroll window covers, unions them with the frozen pane, and draws the row and column bands, the gridlines a sheet asks for, merged regions, and the selection chrome: a wash under the text for a range, and Excel's green frame with its fill handle for the active cell.
- **Text** — a cell's alignment decides whether its text is confined or allowed to spill across the neighbours that carry nothing, which is how a long label reads the same in the preview as it does in Excel. Wrapped and rotated runs are placed without a measuring pass.

Media parts become Blob URLs created with the parsed workbook and revoked with the effect that produced it, so switching files or closing the tab cannot leak media.

<a id="interaction"></a>
## Interaction

The layout is Excel's own, top to bottom. The Name Box names the selection (`B2`, `A1:C3`, `2:3`, `B:C`) and the formula bar shows the active cell's raw value — or its formula, when it has one. The worksheet surface carries the row-number and column-letter bands, whose entries select a whole row or column and tint to show what the selection covers. The sheet-tab strip selects a sheet, and the status bar steps between sheets and drives the zoom; the zoom readout doubles as the fit-to-window control.

The grid is keyboard-first, as a spreadsheet is. Arrow keys walk the cells, `Tab` and `Enter` walk a row and a column, `Home` and `End` jump to the edges of the sheet, `Ctrl+Home`/`Ctrl+End` go to its corners, `PageUp`/`PageDown` move by a screenful, and holding `Shift` extends the range from wherever it started. A pointer press selects a cell, `Shift`-clicking extends the range, double-clicking selects the whole sheet, and the grid scrolls the active cell into sight after every move.

<a id="model-experience"></a>
## Model Experience

None, as the preview is a browser-only viewer that registers no tool, prompt section, or session event.

#### KV Cache effect

No direct effect; what the user reads here never enters a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Legacy `.xls` and binary `.xlsb` are explained, not drawn.** BIFF8 and the binary workbook format are different containers entirely; the body reports them and names the fix instead of showing an empty grid.
- **Charts, shapes, and text boxes are not drawn.** Pictures anchored to the grid render; every other drawing object is skipped rather than shown as a placeholder, because a spreadsheet's drawings are usually annotations over data that already reads correctly.
- **Conditional formatting is not applied.** A cell shows its stored value and its `cellXfs` style; rules in the `dxfs` table are not evaluated.
- **Data validation, comments, and sparklines are not rendered.**
- **Formulas are shown, not calculated.** A cell displays the cached value Excel stored; a workbook saved without cached values shows an empty cell with its formula in the formula bar.
- **Pattern fills are approximated by their foreground colour**, and gradients in cells are not drawn.
- **A cell's formatted width is not measured.** Text spills or clips by the neighbours' occupancy, as Excel decides it, but a run that is wider than the space available is clipped without Excel's own measured elision.
- **A sheet that lays out right-to-left is drawn left-to-right.** The sheet's own `rightToLeft` flag is not applied to the grid, so an RTL sheet reads with its columns mirrored from Excel's order.
- **A merge region that names a position its sheet never wrote** is clamped to the sheet's last visible position rather than drawn beyond it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`number-format.ts` is the piece worth reading first: it is a pure function from (value, format code) to the displayed string and carries the tests that pin Excel's behaviour, including the 1900 leap-year quirk. `render/geometry.ts` is the second: it is the whole virtualisation contract, and `render/SheetGrid.tsx` is a drawing pass over it. Nothing in `xlsx/` or `render/` imports Cordis, a slot, or another plugin.

</details>

**Runtime invariant:** No companion is published. The parse is a pure function from package bytes to a model, and the viewing state belongs to the shared store declaration; there is no second independent observation to compare against. Registration disposal and the Blob URL lifetime are covered by behavior tests.
