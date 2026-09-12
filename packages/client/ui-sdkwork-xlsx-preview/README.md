---
description: "Spreadsheet previews in the right Sidebar: an offline SpreadsheetML renderer that draws Excel's own window — Name Box, formula bar, sheet tabs, status bar, and an Office-accurate virtualised cell grid — and edits it with Excel's own keys and semantics, for .xlsx/.xlsm/.xltx/.xltm."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sdkwork-xlsx-preview

English | [中文](README.zh.md)

## Summary

Open a workbook in the Sidebar and read it the way Excel shows it: the sheet's own fonts, fills, borders, merged regions, frozen panes, and number formats all come through as stored, with no server or converter in the path. The window is Excel's, from the Name Box and formula bar down to the sheet-tab strip and status bar. The worksheet surface fills its page whatever the workbook holds — a brand-new workbook with one empty cell paints gridlines to the window's own edges and scrolls the way a spreadsheet does — and the row-number and column-letter bands stay pinned to the page's edges while it scrolls. Select cells and ranges with the keyboard or the pointer and read their average, count, and sum off the status bar; only the cells on screen are mounted, so a workbook with a hundred thousand populated rows opens at the cost of the visible ones.

The same surface edits. Typing, `F2`, `Backspace`, `Delete`, `Enter`, `Tab`, `Esc`, the arrow keys, the clipboard, and the fill handle all mean what they mean in Excel, the formula bar is a field rather than a readout, and a changed workbook leaves through **Save a copy** — the preview contract is read-only, so nothing is written back to the document on disk.

## Table of Contents

- [What it registers](#what-it-registers)
- [How it renders](#how-it-renders)
- [Interaction](#interaction)
- [Editing](#editing)
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
- **Sheets** — `workbook.ts` reads column widths, row heights, merged regions, the frozen pane, hyperlinks, and pictures anchored to the grid, converting character widths and point heights to pixels. It also reads the sheet's own view: whether it paints gridlines, lays out right-to-left, shows its row and column bands, and what zoom it was saved at. Hidden rows and columns are dropped from the visible index rather than laid out at zero size, so the grid never walks a gap. The laid-out index carries an empty tail past the content — a floor of 1024 columns and 4096 rows, held to the worksheet's own 16 384 × 1 048 576 limits — so the surface covers any window at any supported zoom; the sheet's *used range* travels beside it and stays what `Ctrl+End`, `Ctrl+A`, and a fit-to-window measure.
- **Layout** — `render/geometry.ts` turns that index into cumulative pixel offsets, so the virtual window asks for the offset of its first visible column and walks from there; a sheet that states a height for its hundred-thousandth row costs one array entry, not a hundred thousand.
- **The surface** — `render/SheetGrid.tsx` mounts only the positions the scroll window covers, unions them with the frozen pane, and draws the gridlines a sheet asks for, merged regions, and the selection chrome: a wash under the text for a range, and Excel's green frame with its fill handle for the active cell. The zoom is applied to the sheet inside the scrollport rather than to the scrollport itself, so raising it shows more cells instead of shrinking the paper, and a fit is computed from the viewport the reader actually has. Frozen panes are pinned by compensating for the scroll offset: a frozen row or column states its own position plus exactly the scroll the scrollport would otherwise take off it, which is what keeps it on the page.
- **The header bands** — the row-number and column-letter bands are the scrollport's **siblings**, translated by the scroll offset, not its children. A band inside the scrollport leaves the page the moment the reader scrolls; outside it, the two stay on the page's edges the way Excel keeps them, and each band entry takes the same frozen-pane compensation its cells do.
- **Text** — a cell's alignment decides whether its text is confined or allowed to spill across the neighbours that carry nothing, and where it sits vertically: `top`, `center`, or `bottom`, the last of which is Excel's own default for a cell that states none. Wrapped and rotated runs are placed without a measuring pass.

Media parts become Blob URLs created with the parsed workbook and revoked with the effect that produced it, so switching files or closing the tab cannot leak media.

<a id="interaction"></a>
## Interaction

The layout is Excel's own, top to bottom. The Name Box names the selection (`B2`, `A1:C3`, `2:3`, `B:C`) and jumps to a reference typed into it, and the formula bar shows the active cell's raw value — or its formula, when it has one. The worksheet surface carries the row-number and column-letter bands, whose entries select a whole row or column and tint to show what the selection covers, and the corner where the two bands meet selects the whole sheet. The sheet-tab strip selects a sheet; the status bar reports what the selection holds — its average, its count, and its sum — and steps between sheets and drives the zoom, where the zoom readout doubles as the fit-to-window control.

The grid is keyboard-first, as a spreadsheet is. Arrow keys walk the cells, `Tab` and `Enter` walk a row and a column, `Home` and `End` jump to the edges of the sheet, `Ctrl+Home`/`Ctrl+End` go to its corners, `PageUp`/`PageDown` move by a screenful, and holding `Shift` extends the range from wherever it started. A pointer press selects a cell and leaves the keyboard on the grid, dragging while the button is held extends the range from there, `Shift`-clicking extends to the clicked cell, double-clicking opens the editor on the cell it lands in, and the grid scrolls the active cell into sight after every move.

<a id="editing"></a>
## Editing

A cell is edited in place, exactly as Excel edits one: the field replaces the cell's own painting, inherits its rectangle and its font, and takes the caret at the end of what the cell held, so amending a value never means retyping it. While the draft is wider than the cell, the field grows over the empty neighbours beside it, in the direction the cell's alignment points. The keys mean what they mean in Excel — a printable character replaces the contents, `F2` opens the field on the value already there, `Backspace` and `Delete` clear the selection without opening anything, `Enter` and `Tab` confirm and carry the selection down and across, `Shift` reverses that direction, and `Esc` abandons the draft. The arrow keys follow Excel's two modes: an editor opened by typing confirms on an arrow and moves the selection with it, while an editor opened by `F2` or a double click keeps the arrows for the caret. A press on another cell confirms the field, and so does leaving it. The formula bar is one view of the same edit — it mirrors the cell's draft as it is typed, seeds itself from the active cell otherwise, records on `Enter` and on losing focus, and abandons on `Esc`.

What a reader types is read the way Excel reads it. Text starting with `=` is a formula, and a leading `'` keeps everything after it as text. A plain number, a grouped one, a percentage, a currency amount, a scientific figure, and a parenthesised negative all become numbers; `TRUE` and `FALSE` become booleans; an unambiguous `YYYY-MM-DD` becomes a date. Editing any position of a merged region writes the region's anchor, as Excel does, because the region has one value. `Ctrl+C`, `Ctrl+X`, and `Ctrl+V` move a rectangle as tab-separated text with quoted fields, so a selection pastes into another sheet, another workbook, or another application, and a copied range keeps Excel's marching-ants outline until a paste spends it or `Esc` puts it away. `Ctrl+D` and `Ctrl+R` fill the selection down and right from its own top row and left column. `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z` step the history, and the toolbar's own buttons carry the same two commands and show whether there is anything to step to. Dragging the active cell's fill handle extends a rectangle over the cells the drag reaches, and a run of numbers or dates continues arithmetically rather than repeating, which is what keeps `1,000` and `2,000` going as `3,000`. The Name Box is a field as well: a reference typed into it puts the selection there, and `A1:B2` takes a range.

Nothing is written back to the document. The preview contract has no write path, so an edited workbook leaves through **Save a copy**: the sheet's own part is patched, the package is rewritten around it, and the bytes go to the browser as an `.xlsx` download. The bar marks a workbook that now differs from the file on disk, and a package the editor cannot rewrite — a ZIP64 archive, for instance — is reported by name rather than dropped in silence.

Every edit lands in one log of final cell states, held per sheet and folded over the parsed model when the grid draws, so moving between sheets keeps each sheet's work and re-drawing never costs a re-parse. The undo history is a stack of whole logs rather than a stack of inverse operations, so an undo is exact and cannot drift from the edits it reverses. A confirmation that changes nothing is dropped rather than recorded, which is what leaves `F2` followed straight by `Enter` a workbook still clean.

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
- **Formulas are shown, not calculated.** A cell displays the cached value Excel stored; a workbook saved without cached values shows an empty cell with its formula in the formula bar. Committing a formula stores the text of the formula and does not evaluate it, so a cell whose inputs change keeps the value it was saved with.
- **Neither format nor structure is editable.** A cell's value can be changed; its font, fill, borders, alignment, number format, row height, column width, and position cannot, and rows, columns, and sheets cannot be added, removed, or reordered.
- **Pattern fills are approximated by their foreground colour**, and gradients in cells are not drawn.
- **A cell's formatted width is not measured.** Text spills or clips by the neighbours' occupancy, as Excel decides it, but a run that is wider than the space available is clipped without Excel's own measured elision.
- **A sheet that lays out right-to-left is drawn left-to-right.** The sheet's own `rightToLeft` flag is not applied to the grid, so an RTL sheet reads with its columns mirrored from Excel's order.
- **A merge region that names a position its sheet never wrote** is clamped to the sheet's last visible position rather than drawn beyond it.
- **A package the editor cannot rewrite is reported, not forced.** The rewriter needs the sheet's part to be a plain ZIP entry, so an archive that stores it with ZIP64 is refused by name rather than half-written.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

`number-format.ts` is the piece worth reading first: it is a pure function from (value, format code) to the displayed string and carries the tests that pin Excel's behaviour, including the 1900 leap-year quirk. `render/geometry.ts` is the second: it is the whole virtualisation contract, and `render/SheetGrid.tsx` is a drawing pass over it. Nothing in `xlsx/` or `render/` imports Cordis, a slot, or another plugin.

Editing is split so that the parts that can be reasoned about without a browser are, and the parts that cannot are one call wide. `render/editing.ts` holds the rules with no state in them — what a key means, what a typed entry becomes, what a rectangle reads as, what a fill writes. `xlsx/edits.ts` holds the log: the ordered past and future, the overlay, and the per-sheet commit. `xlsx/serialize.ts` patches one worksheet part and rewrites the package around it. `render/useSheetEditing.ts` is the only stateful piece and the only place the three meet; `clipboard.ts` and `save.ts` are one call each to the browser, which is what keeps every refusal they can meet a caught value rather than a crash. A read-only grid is the same grid with no editing surface: the prop is optional, and its absence leaves the selection keyboard untouched.

</details>

**Runtime invariant:** No companion is published. The parse is a pure function from package bytes to a model, and the viewing state belongs to the shared store declaration; there is no second independent observation to compare against. Registration disposal, the Blob URL lifetime, the edit log's round trip through the serializer, and the save path are covered by behavior tests.
