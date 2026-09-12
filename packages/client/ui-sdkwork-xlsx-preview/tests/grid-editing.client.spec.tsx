// @vitest-environment jsdom
/** The worksheet surface while it is editable: the field, the keys, and a fill. */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SheetGrid } from '../src/client/render/SheetGrid.tsx'
import type { GridEditing } from '../src/client/render/SheetGrid.tsx'
import { extendsBounds } from '../src/client/render/selection.ts'
import type { GridSelectionHandle } from '../src/client/render/useGridSelection.ts'
import { DEFAULT_FORMAT, makeCell, makeSheet } from './sheet-fixture.client.ts'
import type { SheetOptions } from './sheet-fixture.client.ts'

/** A controller that records what the grid asks of it. */
function stubController(overrides: Partial<GridSelectionHandle> = {}): GridSelectionHandle {
  return {
    selection: { anchor: { column: 0, row: 0 }, focus: { column: 0, row: 0 }, kind: 'cell' },
    active: { column: 0, row: 0 },
    selectPoint: vi.fn(),
    selectRow: vi.fn(),
    selectColumn: vi.fn(),
    selectSheet: vi.fn(),
    extendTo: vi.fn(),
    onKeyDown: vi.fn(),
    goTo: vi.fn(),
    ...overrides,
  }
}

/** An editing surface that records what the grid asks of it. */
function stubEditing(overrides: Partial<GridEditing> = {}): GridEditing {
  return {
    open: undefined,
    editLabel: 'Edit cell',
    editHint: 'Editing',
    clipboard: undefined,
    begin: vi.fn(),
    draft: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    cancelClipboard: vi.fn(),
    clear: vi.fn(),
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(),
    fill: vi.fn(),
    fillDown: vi.fn(),
    fillRight: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  }
}

/**
 * Render the grid over a sheet, with an editing surface when a spec states one.
 * @param options - the sheet options to build the fixture with.
 * @param editing - the editing surface, absent for a read-only grid.
 * @param controller - the controller the grid mutates.
 * @returns the controller the grid received.
 */
function mount(
  options: SheetOptions,
  editing?: GridEditing,
  controller: GridSelectionHandle = stubController(),
): GridSelectionHandle {
  render(
    <SheetGrid
      sheet={makeSheet(options)}
      scale={1}
      resizeObserver={vi.fn()}
      controller={controller}
      selectAllLabel="Select all"
      editing={editing}
    />,
  )
  return controller
}

/**
 * Give every element the stage size the grid's window arithmetic reads.
 *
 * Four 64px columns and four 20px rows fit a 400x300 stage whole, so every
 * position a spec names is really on screen.
 */
function sizedStage(): void {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 300 })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 })
}

/**
 * Mount over a sheet whose every position is inside the mounted window.
 * @param editing - the editing surface, absent for a read-only grid.
 * @param controller - the controller the grid mutates.
 * @returns the controller the grid received.
 */
function mountGrid(editing?: GridEditing, controller?: GridSelectionHandle): GridSelectionHandle {
  sizedStage()
  return mount({ columns: 3, rows: 3, cells: [makeCell(0, 0, 'Region')] }, editing, controller)
}

/** An element the grid rendered, by its data attribute. */
function node(selector: string): HTMLElement {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`no element matches ${selector}`)
  return found as HTMLElement
}

/** Press a key on the grid's stage. */
function press(key: string, init: KeyboardEventInit = {}): void {
  fireEvent.keyDown(node('[data-xlsx-stage]'), { key, ...init })
}

/** The field the open editor draws. */
function field(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-xlsx-cell-editor]') as HTMLInputElement
}

/** Release the pointer outside the grid, which is what ends a drag. */
function release(): void {
  fireEvent.pointerUp(window)
}

afterEach(cleanup)

describe('extendsBounds', () => {
  const source = { top: 1, left: 1, bottom: 2, right: 2 }

  it('reports a rectangle that reaches beyond another', () => {
    expect(extendsBounds(source, { top: 0, left: 1, bottom: 2, right: 2 })).toBe(true)
    expect(extendsBounds(source, { top: 1, left: 0, bottom: 2, right: 2 })).toBe(true)
    expect(extendsBounds(source, { top: 1, left: 1, bottom: 3, right: 2 })).toBe(true)
    expect(extendsBounds(source, { top: 1, left: 1, bottom: 2, right: 3 })).toBe(true)
  })

  it('reports a rectangle that is the same or smaller as reaching nothing', () => {
    expect(extendsBounds(source, source)).toBe(false)
    expect(extendsBounds(source, { top: 1, left: 1, bottom: 1, right: 1 })).toBe(false)
  })
})

describe('a read-only grid', () => {
  it('keeps every key for the selection', () => {
    const controller = mountGrid()
    press('a')
    expect(controller.onKeyDown).toHaveBeenCalled()
  })

  it('leaves the fill handle inert', () => {
    const controller = mountGrid()
    fireEvent.pointerDown(node('[data-xlsx-fill-handle]'))
    expect(document.querySelector('[data-xlsx-fill-preview]')).toBeNull()
    expect(controller.selectPoint).not.toHaveBeenCalled()
  })
})

describe('the in-cell editor', () => {
  it('draws a field on the cell the open editor names, in that cell’s own type', () => {
    mountGrid(stubEditing({ open: { column: 0, row: 0, entry: 'append', text: 'Region' } }))
    const input = field()
    expect(input.value).toBe('Region')
    expect(input.getAttribute('aria-label')).toBe('Edit cell')
    expect(input.title).toBe('Editing')
    // The cell's own painting steps aside for the field, as Excel's does.
    expect(node('[data-xlsx-cell="A1"]').firstElementChild).toBe(input)
  })

  it('leaves an empty cell’s field to the sheet’s default type', () => {
    mountGrid(stubEditing({ open: { column: 1, row: 1, entry: 'replace', text: 'x' } }))
    expect(field().style.fontSize).toBe('')
  })

  it('edits a cell that carries its own type in that type', () => {
    sizedStage()
    mount(
      {
        columns: 3,
        rows: 3,
        // A cell that states its own weight, slant, and no colour of its own,
        // which is the combination a themed workbook's header most often is.
        cells: [makeCell(0, 0, 'Region', {
          ...DEFAULT_FORMAT,
          font: { ...DEFAULT_FORMAT.font, bold: true, italic: true, color: undefined },
        })],
      },
      stubEditing({ open: { column: 0, row: 0, entry: 'append', text: 'Region' } }),
    )
    const input = field()
    expect(input.style.fontWeight).toBe('700')
    expect(input.style.fontStyle).toBe('italic')
    // A cell with no colour of its own writes in the sheet's default ink.
    expect(input.style.color).toBe('rgb(0, 0, 0)')
  })

  it('lets the field go when the editor closes', () => {
    sizedStage()
    const shared = {
      sheet: makeSheet({ columns: 3, rows: 3, cells: [makeCell(0, 0, 'Region')] }),
      scale: 1,
      resizeObserver: vi.fn(),
      controller: stubController(),
      selectAllLabel: 'Select all',
    }
    const { rerender } = render(
      <SheetGrid {...shared} editing={stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })} />,
    )
    expect(field()).toBeTruthy()

    rerender(<SheetGrid {...shared} editing={stubEditing()} />)
    expect(document.querySelector('[data-xlsx-cell-editor]')).toBeNull()
  })

  it('reports the draft as the reader types', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    mountGrid(editing)
    fireEvent.change(field(), { target: { value: 'South' } })
    expect(editing.draft).toHaveBeenCalledWith('South')
  })

  it('commits on Enter and carries the selection down', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    const controller = mountGrid(editing)
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(editing.commit).toHaveBeenCalled()
    expect(controller.goTo).toHaveBeenCalledWith('A2')
  })

  it('confirms on an arrow in Enter mode and carries the selection with it', () => {
    // An editor opened by typing is in Enter mode: the arrows commit, which is
    // how Excel turns a column of entries into one keystroke per cell.
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    const controller = mountGrid(editing)
    fireEvent.keyDown(field(), { key: 'ArrowRight' })
    expect(editing.commit).toHaveBeenCalled()
    expect(controller.goTo).toHaveBeenCalledWith('B1')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    expect(controller.goTo).toHaveBeenLastCalledWith('A2')
  })

  it('leaves the arrows to the caret in Edit mode', () => {
    // An editor opened by F2 or a double click is in Edit mode, so the arrows
    // walk the caret instead of the selection.
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'append', text: 'Region' } })
    const controller = mountGrid(editing)
    fireEvent.keyDown(field(), { key: 'ArrowRight' })
    expect(editing.commit).not.toHaveBeenCalled()
    expect(controller.goTo).not.toHaveBeenCalled()
  })

  it('carries the selection up for Shift+Enter and sideways for Tab', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    const controller = mountGrid(editing)
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true })
    expect(controller.goTo).toHaveBeenCalledWith('A1')
    fireEvent.keyDown(field(), { key: 'Tab' })
    expect(controller.goTo).toHaveBeenCalledWith('B1')
    fireEvent.keyDown(field(), { key: 'Tab', shiftKey: true })
    expect(controller.goTo).toHaveBeenCalledWith('A1')
  })

  it('abandons the draft on Escape', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    const controller = mountGrid(editing)
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(editing.cancel).toHaveBeenCalled()
    expect(editing.commit).not.toHaveBeenCalled()
    expect(controller.goTo).not.toHaveBeenCalled()
  })

  it('confirms the draft when the field loses focus', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    const controller = mountGrid(editing)
    fireEvent.blur(field())
    expect(editing.commit).toHaveBeenCalled()
    expect(controller.goTo).toHaveBeenCalledWith('A1')
  })

  it('leaves every other key to the field, so the caret can move', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'append', text: 'a' } })
    const controller = mountGrid(editing)
    fireEvent.keyDown(field(), { key: 'End' })
    fireEvent.keyDown(field(), { key: 'a' })
    expect(editing.commit).not.toHaveBeenCalled()
    expect(editing.cancel).not.toHaveBeenCalled()
    expect(controller.onKeyDown).not.toHaveBeenCalled()
  })

  it('ignores a press on the field rather than confirming the edit it holds', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    const controller = mountGrid(editing)
    fireEvent.pointerDown(field())
    expect(editing.commit).not.toHaveBeenCalled()
    expect(controller.selectPoint).not.toHaveBeenCalled()
  })

  it('ignores every grid key while a field is open', () => {
    const editing = stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a' } })
    const controller = mountGrid(editing)
    press('a')
    press('Delete')
    press('ArrowDown')
    press('z', { ctrlKey: true })
    expect(editing.begin).not.toHaveBeenCalled()
    expect(editing.clear).not.toHaveBeenCalled()
    expect(editing.undo).not.toHaveBeenCalled()
    expect(controller.onKeyDown).not.toHaveBeenCalled()
  })
})

describe('the grid’s own keys', () => {
  it('opens the field on the character a reader types', () => {
    const editing = stubEditing()
    const controller = mountGrid(editing, stubController({ active: { column: 1, row: 1 } }))
    press('7')
    expect(editing.begin).toHaveBeenCalledWith({ column: 1, row: 1 }, 'replace', '7')
    expect(controller.onKeyDown).not.toHaveBeenCalled()
  })

  it('opens the field on the cell’s value for F2, and clears on Backspace', () => {
    const editing = stubEditing()
    const controller = mountGrid(editing, stubController({
      selection: { anchor: { column: 0, row: 0 }, focus: { column: 1, row: 1 }, kind: 'cell' },
    }))
    press('F2')
    expect(editing.begin).toHaveBeenCalledWith({ column: 0, row: 0 }, 'append', '')
    // Backspace empties the selection without opening an editor, which is what
    // Excel's own Backspace does.
    press('Backspace')
    expect(editing.clear).toHaveBeenCalledWith({ top: 0, left: 0, bottom: 1, right: 1 })
    expect(editing.begin).toHaveBeenCalledTimes(1)
    expect(controller.onKeyDown).not.toHaveBeenCalled()
  })

  it('clears the selection on Delete', () => {
    const editing = stubEditing()
    const controller = mountGrid(editing, stubController({
      selection: { anchor: { column: 0, row: 0 }, focus: { column: 1, row: 1 }, kind: 'cell' },
    }))
    press('Delete')
    expect(editing.clear).toHaveBeenCalledWith({ top: 0, left: 0, bottom: 1, right: 1 })
    expect(controller.onKeyDown).not.toHaveBeenCalled()
  })

  it('reads every clipboard shortcut', () => {
    const editing = stubEditing()
    const controller = mountGrid(editing, stubController({ active: { column: 1, row: 1 } }))

    press('c', { ctrlKey: true })
    expect(editing.copy).toHaveBeenCalledWith({ top: 0, left: 0, bottom: 0, right: 0 })

    press('x', { ctrlKey: true })
    expect(editing.cut).toHaveBeenCalledWith({ top: 0, left: 0, bottom: 0, right: 0 })

    press('v', { ctrlKey: true })
    expect(editing.paste).toHaveBeenCalledWith({ column: 1, row: 1 })

    press('d', { ctrlKey: true })
    expect(editing.fillDown).toHaveBeenCalledWith({ top: 0, left: 0, bottom: 0, right: 0 })

    press('r', { ctrlKey: true })
    expect(editing.fillRight).toHaveBeenCalledWith({ top: 0, left: 0, bottom: 0, right: 0 })

    press('z', { ctrlKey: true })
    expect(editing.undo).toHaveBeenCalled()

    press('y', { ctrlKey: true })
    press('Z', { ctrlKey: true, shiftKey: true })
    expect(editing.redo).toHaveBeenCalledTimes(2)

    expect(controller.onKeyDown).not.toHaveBeenCalled()
  })

  it('leaves the moves, and Ctrl+A, to the selection', () => {
    const editing = stubEditing()
    const controller = mountGrid(editing)
    press('ArrowDown')
    press('Enter')
    press('PageDown')
    press('a', { ctrlKey: true })
    expect(controller.onKeyDown).toHaveBeenCalledTimes(4)
    expect(editing.begin).not.toHaveBeenCalled()
  })

  it('opens the field on the cell a double click lands in', () => {
    const editing = stubEditing()
    mountGrid(editing)
    fireEvent.doubleClick(node('[data-xlsx-cell="B2"]'))
    expect(editing.begin).toHaveBeenCalledWith({ column: 1, row: 1 }, 'append', '')
  })

  it('leaves a double click that lands on no cell alone', () => {
    const editing = stubEditing()
    mountGrid(editing)
    fireEvent.doubleClick(node('[data-xlsx-stage]'))
    expect(editing.begin).not.toHaveBeenCalled()
  })
})

describe('the marching-ants outline', () => {
  it('frames the range the clipboard holds until Escape takes it down', () => {
    const editing = stubEditing({ clipboard: { top: 0, left: 0, bottom: 1, right: 1 } })
    const controller = mountGrid(editing)
    const frame = node('[data-xlsx-clipboard-frame]')
    expect(frame).toBeTruthy()
    // Two 64px columns and two 20px rows, from the header band's edge.
    expect(frame.style.left).toBe('20px')
    expect(frame.getAttribute('width')).toBe('128')
    expect(frame.getAttribute('height')).toBe('40')

    press('Escape')
    expect(editing.cancelClipboard).toHaveBeenCalled()
    expect(controller.onKeyDown).not.toHaveBeenCalled()
  })

  it('draws nothing while the clipboard holds no rectangle', () => {
    mountGrid(stubEditing())
    expect(document.querySelector('[data-xlsx-clipboard-frame]')).toBeNull()
  })
})

describe('the field a long draft needs', () => {
  it('grows over the empty neighbours while the draft is wider than the cell', () => {
    // The canvas measure is unavailable here, so the draft's width is the
    // average-glyph estimate: thirty characters of 11pt text reach well past
    // one 64px column and stop when the estimate is covered.
    mountGrid(stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'a draft long enough to overflow its cell' } }))
    const input = field()
    expect(Number.parseInt(input.style.width, 10)).toBeGreaterThan(64)
    expect(Number.parseInt(input.style.width, 10)).toBeGreaterThan(Number.parseInt(input.style.left || '0', 10) + 64)
  })

  it('stays on the cell while the draft fits it', () => {
    mountGrid(stubEditing({ open: { column: 0, row: 0, entry: 'replace', text: 'ab' } }))
    expect(field().style.width).toBe('64px')
    expect(field().style.left).toBe('0px')
  })
})

describe('the fill drag', () => {
  it('outlines the rectangle the drag reaches, and writes it on release', () => {
    const editing = stubEditing()
    mountGrid(editing)

    fireEvent.pointerDown(node('[data-xlsx-fill-handle]'))
    // A press on the handle is not a press on the cell it sits over.
    expect(node('[data-xlsx-fill-preview]').style.height).toBe('20px')

    fireEvent.pointerMove(node('[data-xlsx-cell="A3"]'))
    expect(node('[data-xlsx-fill-preview]').style.height).toBe('60px')

    release()
    expect(editing.fill).toHaveBeenCalledWith({ top: 0, left: 0, bottom: 0, right: 0 }, { top: 0, left: 0, bottom: 2, right: 0 })
    // The outline goes with the release.
    expect(document.querySelector('[data-xlsx-fill-preview]')).toBeNull()
  })

  it('fills nothing when the handle is pressed without moving', () => {
    const editing = stubEditing()
    mountGrid(editing)
    fireEvent.pointerDown(node('[data-xlsx-fill-handle]'))
    release()
    expect(editing.fill).not.toHaveBeenCalled()
  })

  it('fills nothing when the drag never reaches a cell', () => {
    const editing = stubEditing()
    mountGrid(editing)
    fireEvent.pointerDown(node('[data-xlsx-fill-handle]'))
    fireEvent.pointerMove(node('[data-xlsx-stage]'))
    release()
    expect(editing.fill).not.toHaveBeenCalled()
  })

  it('cancels the fill when the pointer is taken away', () => {
    const editing = stubEditing()
    mountGrid(editing)
    fireEvent.pointerDown(node('[data-xlsx-fill-handle]'))
    fireEvent.pointerMove(node('[data-xlsx-cell="A3"]'))
    fireEvent.pointerCancel(window)
    expect(editing.fill).not.toHaveBeenCalled()
    expect(document.querySelector('[data-xlsx-fill-preview]')).toBeNull()
  })

  it('offers the handle on a range, so a run can start a fill', () => {
    const editing = stubEditing()
    const controller = mountGrid(editing, stubController({
      selection: { anchor: { column: 0, row: 1 }, focus: { column: 1, row: 2 }, kind: 'cell' },
    }))
    // Excel draws the handle on the corner of whatever is selected, and a run
    // of two cells is what a fill continues into a series rather than echoing.
    expect(node('[data-xlsx-fill-handle]')).toBeTruthy()
    expect(node('[data-xlsx-selection]')).toBeTruthy()

    fireEvent.pointerDown(node('[data-xlsx-fill-handle]'))
    fireEvent.pointerMove(node('[data-xlsx-cell="A4"]'))
    release()

    expect(editing.fill).toHaveBeenCalledWith(
      { top: 1, left: 0, bottom: 2, right: 1 },
      { top: 1, left: 0, bottom: 3, right: 1 },
    )
    // The filled rectangle is left selected, ready for the next drag.
    expect(controller.selectPoint).toHaveBeenCalledWith({ column: 0, row: 1 }, false)
    expect(controller.extendTo).toHaveBeenCalledWith({ column: 1, row: 3 })
  })
})
