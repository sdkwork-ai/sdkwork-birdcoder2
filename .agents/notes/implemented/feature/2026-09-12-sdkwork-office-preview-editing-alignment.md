# Agent Note: The office previews align editing and chrome with Office's own

Status: implemented

English | [中文](2026-09-12-sdkwork-office-preview-editing-alignment.zh.md)

## Problem

The three office preview packages already drew Office documents as viewers, but the editing surfaces and the chrome around them had drifted from what Office itself draws, and two rendering defects hid a behaviour the packages claimed.

Against Excel: `Backspace` opened the editor on an emptied cell instead of clearing the selection; the arrows always walked the caret, even in the Enter mode Excel enters when a reader types; the in-cell field never grew past its own cell; the formula bar did not mirror an in-cell draft; `Ctrl+D` and `Ctrl+R` were absent; a copied range left no marching-ants outline; and the Name Box refused a typed reference. Two rendering defects hid Excel's text spill entirely: every cell painted an opaque paper background that covered a neighbour's spilled text, the spill band was clipped by its own cell's `overflow: hidden`, and the band extended leftward, which left-aligned text — the only kind this renderer lets spill — never does in Excel.

Against PowerPoint: a shape had no selection state at all, so there was nothing to select before editing; the in-place text editor covered the shape with an opaque white box in a fixed sans font, discarding the shape's own look while it was edited; `Esc` committed the edit twice on the way to discarding it, leaving two undo entries; and the arrow keys leaked through to slide stepping while the editor was open.

Against Word: a tab stop's leader — the dotted line every table of contents rides on — was not drawn, and an `atLeast` line rule capped the line at the stated height instead of flooring it.

## Decision

The editing rules live where they already lived, and the renderers paint the chrome Office paints.

- **Excel's key meanings** (`render/editing.ts`): `Backspace` clears the selection like `Delete`. The arrows follow Excel's two modes — an editor opened by typing (Enter mode) confirms on an arrow and moves the selection with it, while an editor opened by `F2` or a double click (Edit mode) keeps the arrows for the caret. `Ctrl+D` and `Ctrl+R` fill the selection down and right from its own top row and left column, via `fillDownEntries`/`fillRightEntries` beside the other pure fill rules.
- **The edit field grows** (`render/cells.ts`, `render/measure.ts`): while the draft is wider than the cell, the field extends over the neighbouring positions that carry nothing, in the direction the cell's alignment points — right for text, left for values, both for centred — and stops at the first occupied neighbour or the sheet edge. The width is measured with a canvas context against the cell's own font, with an average-glyph estimate where no canvas exists.
- **Spill renders as Excel spills it** (`render/SheetGrid.tsx`, `render/cells.ts`): a cell paints only when it states a fill of its own, so the sheet's paper and a neighbour's spilled text show through; the spill band starts at its own cell and is cut at an occupied neighbour's left edge; and the cell element no longer clips its children, which the text layer's own clipping makes unnecessary.
- **Clipboard chrome**: a copied or cut range records its rectangle in the edit log, the grid draws it as a marching-ants SVG outline whose dash travel the animation walks, a paste spends it, and `Esc` takes it down.
- **The Name Box is a field**: a typed reference puts the selection there, `A1:B2` takes a range, and leaving without `Enter` restores the selection's own name. The formula bar mirrors an in-cell draft as it is typed and commits it when it loses focus.
- **PowerPoint selection and in-place editing** (`render/ShapeView.tsx`, `render/paint.ts`, `PptxBody.tsx`): a press puts the selection hairline and its eight handles on a shape, a double click opens the text editor and `Esc` ends the edit first and takes the selection off second, and a press on the slide's paper takes the selection off. The editor replaces only the text frame: the shape's paint stays visible beneath, each line carries its paragraph's alignment, spacing, and first-run type, bullet markers ride on `::before` pseudo elements so they stay out of the text a commit reads back, and a press anywhere the field does not contain confirms the draft, which a removal from the document alone cannot.
- **Word leaders and at-least lines** (`docx/format.ts`, `render/BlockView.tsx`): a stop that declares `dot`, `hyphen`, or `underscore` fills the free width before its segment with the repeating mark as its own flex item, and an `atLeast` line rule takes the larger of the stated height and the typeface's probed natural pitch.

A table row never divided mid-row in this renderer, so `w:cantSplit` was already satisfied and stays unconsulted.

## Alternatives considered

**Keep the edit field clipped to the cell.** Growth without measurement could have been approximated from the committed text's spill span, but the field's box would then cover neighbours even while a short draft was being typed, painting a white card over live cells. The canvas measurement is one call per keystroke and keeps the field at its cell while the draft fits.

**Render the edited bullets as real elements.** Real marker spans would let the editor match PowerPoint's marker alignment exactly, but a browser's own `Enter` inserts plain block children beside them, and a commit reading paragraphs by their containers would then sweep marker glyphs into the saved text. A pseudo element's content never enters `textContent`, so the commit stays clean whatever the browser inserts.

**Select a PowerPoint shape on double click only.** Selection state could have been skipped as editing-adjacent chrome, but PowerPoint's own flow is select, then edit — a reader pressing a shape sees whether the press landed before deciding to type, and `Esc`'s two-step exit needs a selection to step out of.

## Consequences

The office previews read and edit closer to their applications: typed entries walk columns the way Excel's do, a copied range shows the ants a reader expects to chase, a long draft stays visible while it is typed, a PowerPoint shape shows what a press will act on before a double click commits to it, and a Word table of contents carries its dotted leaders. The opaque per-cell background is gone, so a cell is transparent unless it states a fill — the selection wash sits on the paper rather than on a card. Coverage pins the new key table (Enter-mode arrows, `Backspace`, the fill pair, clipboard dismissal), the editor-span arithmetic (directions, occupied stops, sheet edges), the spill semantics, the selection and Escape flows, and the leader and line-rule rendering at the repository's per-file 100% gate. Chrome colours are fixed document palettes (`SELECTION_COLOR` beside the existing Excel constants), not theme tokens, matching the packages' existing contract that the sheet answers to the document rather than the host.
