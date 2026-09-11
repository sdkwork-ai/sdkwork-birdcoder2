// @vitest-environment jsdom
/** The worksheet surface: bands, painted cells, selection chrome, and moves. */
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { SheetGrid, renderRange, selectedFill } from '../src/client/render/SheetGrid.tsx'
import { useGridSelection, pageSize, pointReference } from '../src/client/render/useGridSelection.ts'
import type { GridSelectionHandle } from '../src/client/render/useGridSelection.ts'
import { DEFAULT_FORMAT, makeCell, makeSheet } from './sheet-fixture.client.ts'
import type { SheetOptions } from './sheet-fixture.client.ts'

/**
 * Build the object the grid draws one cell with.
 * @param column - the 0-based column.
 * @param row - the 0-based row.
 * @param text - the displayed text.
 * @param format - the cell's format.
 * @param extra - further cell fields.
 * @returns the cell.
 */
const cell = makeCell

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

/**
 * Render the grid over a sheet.
 * @param options - the sheet options to build the fixture with.
 * @param controller - the controller the grid mutates.
 * @param scale - the viewer scale to draw at.
 * @returns the controller the grid received.
 */
function mountGrid(
  options: SheetOptions,
  controller: GridSelectionHandle = stubController(),
  scale = 1,
): GridSelectionHandle {
  const sheet = makeSheet(options)
  render(<SheetGrid sheet={sheet} scale={scale} resizeObserver={vi.fn()} controller={controller} />)
  return controller
}

/**
 * Build the key-press helper a hook spec drives its controller with.
 *
 * A press is what the grid's own `keydown` handler receives, minus the DOM
 * event's other fields, so a spec can state only the key and its modifiers.
 * @param result - the mounted hook's result.
 * @returns the press function.
 */
function presser(result: { readonly current: GridSelectionHandle }): (key: string, init?: KeyboardEventInit) => void {
  return (key, init = {}) => {
    act(() => {
      result.current.onKeyDown({ key, preventDefault: () => {}, ...init } as never)
    })
  }
}

/** An element the grid rendered, by its data attribute. */
function node(selector: string): HTMLElement {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`no element matches ${selector}`)
  return found as HTMLElement
}

/**
 * Give every element a stage-shaped viewport, which jsdom reports as zero.
 * @param height - the height to report.
 */
function viewport(height: number): void {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: height })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 400 })
}

/**
 * Give every element a scroll offset, which jsdom always reports as zero.
 *
 * The offset is readable, and a later write may only deepen it — the same shape
 * a real scrollport takes when the grid scrolls a cell into sight, so a spec can
 * pin the window without that pass pulling it back to the top.
 * @param offset - the scroll offset to report.
 */
function patchScroll(offset: number): void {
  let top = offset
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (value: number) => { top = Math.max(top, value) },
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', {
    configurable: true,
    get: () => 0,
    set: () => {},
  })
}

// The measurement stubs are process-wide, so a spec that pins a viewport must
// not leak it into the specs that follow.
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth')
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollTop')
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollLeft')
})

/** The text layer inside a rendered cell. */
function textOf(reference: string): HTMLElement {
  const layer = node(`[data-xlsx-cell="${reference}"]`).firstElementChild
  if (layer === null) throw new Error(`cell ${reference} draws no text`)
  return layer as HTMLElement
}

afterEach(cleanup)

describe('renderRange', () => {
  it('unions the frozen positions with the scrolled window', () => {
    const offsets = [0, 20, 40, 60, 80, 100, 120]
    // Frozen row 0 stays pinned while the window covers positions 3 to 5.
    expect(renderRange(7, 1, offsets, 80, 100)).toEqual([0, 2, 3, 4, 5, 6])
  })

  it('reports nothing for a sheet with no positions', () => {
    expect(renderRange(0, 2, [], 0, 50)).toEqual([])
  })
})

describe('selectedFill', () => {
  it('washes an unfilled cell and tints a filled one', () => {
    expect(selectedFill(undefined)).toContain('linear-gradient')
    expect(selectedFill('#FFFFFF')).toBe('#E9F1ED')
    expect(selectedFill('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
  })
})

describe('SheetGrid', () => {
  it('paints the header bands and a formatted cell', () => {
    mountGrid({
      columns: 3,
      rows: 2,
      showHeaders: true,
      cells: [
        cell(0, 0, 'Header', {
          ...DEFAULT_FORMAT,
          fill: '#4472C4',
          font: { ...DEFAULT_FORMAT.font, bold: true, color: '#FFFFFF' },
          alignment: { ...DEFAULT_FORMAT.alignment, horizontal: 'center', vertical: 'center' },
          borders: { bottom: { color: '#000000', widthPx: 1, dashed: true } },
        }, { kind: 'number' }),
        cell(2, 1, 'link', DEFAULT_FORMAT, { hyperlink: 'https://example.com' }),
        cell(1, 0, 'struck', {
          ...DEFAULT_FORMAT,
          font: { ...DEFAULT_FORMAT.font, strike: true, underline: true, italic: true, color: undefined },
        }),
      ],
      merges: [{ top: 1, left: 0, bottom: 1, right: 1 }],
    })

    expect(node('[data-xlsx-column-header="A"]').textContent).toBe('A')
    expect(node('[data-xlsx-row-header="1"]').textContent).toBe('1')
    expect(node('[data-xlsx-cell="A1"]').style.background).toBe('rgb(68, 114, 196)')
    expect(textOf('A1').style.fontWeight).toBe('700')
    // A merge anchor covers its region and draws no gridline of its own.
    expect(Number.parseInt(node('[data-xlsx-cell="A2"]').style.width, 10)).toBe(128)
    // A hyperlink keeps its own colour, and a plain run takes the default one.
    expect(textOf('C2').style.color).toBe('rgb(5, 99, 193)')
    expect(textOf('B1').style.color).toBe('rgb(0, 0, 0)')
    // Underline and strike compose into one decoration list.
    expect(textOf('B1').style.textDecoration).toBe('underline line-through')
    expect(textOf('B1').style.fontStyle).toBe('italic')
  })

  it('omits the header bands when the sheet hides them', () => {
    mountGrid({ columns: 1, rows: 1, showHeaders: false })
    expect(document.querySelector('[data-xlsx-row-header]')).toBeNull()
    expect(document.querySelector('[data-xlsx-column-header]')).toBeNull()
  })

  it('rotates text and wraps a confined value', () => {
    mountGrid({
      columns: 2,
      rows: 1,
      cells: [
        cell(0, 0, 'vertical', {
          ...DEFAULT_FORMAT,
          alignment: { ...DEFAULT_FORMAT.alignment, rotation: 255 },
        }),
        cell(1, 0, '90', {
          ...DEFAULT_FORMAT,
          alignment: { ...DEFAULT_FORMAT.alignment, rotation: 45, wrapText: true },
        }, { kind: 'number' }),
      ],
    })
    expect(textOf('A1').style.transform).toBe('rotate(270deg)')
    expect(textOf('A1').style.transformOrigin).toBe('top right')
    const rotated = textOf('B1')
    expect(rotated.style.transform).toBe('rotate(-45deg)')
    expect(rotated.style.whiteSpace).toBe('pre-wrap')
  })

  it('lets overflowing text spill across empty neighbours', () => {
    mountGrid({ columns: 3, rows: 0, cells: [cell(0, 0, 'a very long label')] })
    // Four 64px columns, from the first column's left edge to the last's right.
    expect(textOf('A1').style.width).toBe('256px')
  })

  it('draws the active frame, the fill handle, and the frozen seams', () => {
    mountGrid({ columns: 3, rows: 5, freeze: { rows: 1, columns: 1 }, rowHeights: new Map([[0, 40]]) })

    expect(node('[data-xlsx-active-frame]')).toBeTruthy()
    expect(node('[data-xlsx-fill-handle]')).toBeTruthy()
    expect(document.querySelector('[data-xlsx-selection]')).toBeNull()
    expect(node('[data-xlsx-frozen-rows]').style.top).toBe('60px')
    expect(node('[data-xlsx-frozen-columns]').style.left).toBe('84px')
  })

  it('washes a multi-cell selection instead of the single-cell handle', () => {
    mountGrid({ columns: 3, rows: 3 }, stubController({
      selection: { anchor: { column: 0, row: 0 }, focus: { column: 1, row: 1 }, kind: 'cell' },
      active: { column: 1, row: 1 },
    }))
    expect(node('[data-xlsx-selection]')).toBeTruthy()
    expect(document.querySelector('[data-xlsx-fill-handle]')).toBeNull()
    expect(node('[data-xlsx-cell="B2"]').getAttribute('aria-selected')).toBe('true')
  })

  it('frames the whole covered band while the sheet is selected', () => {
    mountGrid({ columns: 2, rows: 2 }, stubController({
      selection: { anchor: { column: 0, row: 0 }, focus: { column: 1, row: 1 }, kind: 'sheet' },
    }))
    // Two 64px columns and two 20px rows, drawn from the header band's edge.
    expect(node('[data-xlsx-active-frame]').style.width).toBe('128px')
    expect(node('[data-xlsx-active-frame]').style.height).toBe('40px')
    expect(node('[data-xlsx-cell="A1"]').style.background).toContain('linear-gradient')
  })

  it('drops the chrome when the selection names a hidden position', () => {
    mountGrid({ columns: 3, rows: 3, columnWidths: new Map([[0, 0]]), rowHeights: new Map([[0, 0]]) }, stubController({
      selection: { anchor: { column: 0, row: 0 }, focus: { column: 2, row: 2 }, kind: 'cell' },
    }))
    expect(document.querySelector('[data-xlsx-active-frame]')).toBeNull()
  })

  it('keeps a merge inside the mounted window and drops the positions it covers', () => {
    viewport(200)
    patchScroll(900)
    mountGrid({
      columns: 2,
      rows: 60,
      merges: [{ top: 43, left: 0, bottom: 43, right: 1 }],
      cells: [cell(0, 43, 'far')],
    })
    const mounted = [...document.querySelectorAll('[data-xlsx-cell]')]
      .map(element => element.getAttribute('data-xlsx-cell'))
    // The anchor is drawn once, covering both positions, and the position it
    // covers is not drawn again.
    expect(mounted).toContain('A44')
    expect(mounted).not.toContain('B44')
    expect(node('[data-xlsx-cell="A44"]').textContent).toBe('far')
    expect(Number.parseInt(node('[data-xlsx-cell="A44"]').style.width, 10)).toBe(128)
  })

  it('selects a cell, extends on Shift, and takes whole bands', () => {
    const controller = mountGrid({ columns: 2, rows: 2 })

    fireEvent.pointerDown(node('[data-xlsx-cell="B2"]'))
    expect(controller.selectPoint).toHaveBeenCalledWith({ column: 1, row: 1 }, false)
    fireEvent.pointerDown(node('[data-xlsx-cell="B1"]'), { shiftKey: true })
    expect(controller.extendTo).toHaveBeenCalledWith({ column: 1, row: 0 })
    fireEvent.pointerDown(node('[data-xlsx-row-header="2"]'))
    expect(controller.selectRow).toHaveBeenCalledWith(1, false)
    fireEvent.pointerDown(node('[data-xlsx-column-header="B"]'), { shiftKey: true })
    expect(controller.selectColumn).toHaveBeenCalledWith(1, true)
    fireEvent.doubleClick(node('[data-xlsx-stage]'))
    expect(controller.selectSheet).toHaveBeenCalled()
  })

  it('ignores a press that lands on no addressable cell', () => {
    const controller = mountGrid({ columns: 1, rows: 1 })
    fireEvent.pointerDown(node('[data-xlsx-row-header="1"]'))
    expect(controller.selectPoint).not.toHaveBeenCalled()
    fireEvent.pointerDown(node('[data-xlsx-stage]'))
    expect(controller.selectPoint).not.toHaveBeenCalled()
    // A stray element that claims a cell address it cannot parse is ignored
    // rather than selecting the origin.
    const decoy = document.createElement('div')
    decoy.dataset.xlsxCell = 'not-an-address'
    node('[data-xlsx-stage]').append(decoy)
    fireEvent.pointerDown(decoy)
    expect(controller.selectPoint).not.toHaveBeenCalled()
  })

  it('scrolls an active cell that sits below the visible window into sight', () => {
    viewport(100)
    patchScroll(0)
    const sheet = makeSheet({ columns: 1, rows: 60 })
    const controller = stubController()
    const view = render(
      <SheetGrid sheet={sheet} scale={1} resizeObserver={vi.fn()} controller={controller} />,
    )
    // The reader walks past the first screen, and the grid follows them.
    view.rerender(
      <SheetGrid
        sheet={sheet}
        scale={1}
        resizeObserver={vi.fn()}
        controller={{ ...controller, active: { column: 0, row: 30 } }}
      />,
    )
    expect(node('[data-xlsx-stage]').scrollTop).toBeGreaterThan(0)
  })

  it('moves the mounted window when the reader scrolls', () => {
    viewport(100)
    patchScroll(0)
    const sheet = makeSheet({ columns: 1, rows: 200 })
    render(<SheetGrid sheet={sheet} scale={1} resizeObserver={vi.fn()} controller={stubController()} />)
    expect(document.querySelector('[data-xlsx-cell="A1"]')).toBeTruthy()
    expect(document.querySelector('[data-xlsx-cell="A100"]')).toBeNull()
    // The scrollport reports a deeper offset, so the window follows it.
    patchScroll(1980)
    fireEvent.scroll(node('[data-xlsx-stage]'))
    expect(document.querySelector('[data-xlsx-cell="A100"]')).toBeTruthy()
  })

  it('leaves a cell with no printable text empty', () => {
    mountGrid({ columns: 1, rows: 0, cells: [cell(0, 0, '')] })
    expect(node('[data-xlsx-cell="A1"]').firstElementChild).toBeNull()
  })

  it('leaves a sparse row empty where the workbook wrote nothing', () => {
    // The sheet's rows are 1 and 5, so rows 2 to 4 carry no row record at all.
    const sparse = makeSheet({ columns: 1, rows: 4, cells: [cell(0, 0, 'first'), cell(0, 4, 'fifth')] })
    render(
      <SheetGrid sheet={sparse} scale={1} resizeObserver={vi.fn()} controller={stubController()} />,
    )
    expect(node('[data-xlsx-cell="A1"]').textContent).toBe('first')
    expect(node('[data-xlsx-cell="A3"]').textContent).toBe('')
    expect(node('[data-xlsx-cell="A5"]').textContent).toBe('fifth')
  })

  it('reports the scrollport and the scale it draws at', () => {
    const resizeObserver = vi.fn()
    const sheet = makeSheet({ columns: 1, rows: 1 })
    const controller = stubController()
    const view = render(
      <SheetGrid sheet={sheet} scale={1.5} resizeObserver={resizeObserver} controller={controller} />,
    )
    expect(resizeObserver).toHaveBeenCalledWith(expect.any(HTMLElement))
    expect(node('[data-xlsx-stage]').style.zoom).toBe('1.5')
    view.rerender(
      <SheetGrid sheet={sheet} scale={2} resizeObserver={resizeObserver} controller={controller} />,
    )
    expect(node('[data-xlsx-stage]').style.zoom).toBe('2')
    // A degenerate scale keeps the handle at its own size instead of dividing
    // it into an unbounded one.
    view.rerender(
      <SheetGrid sheet={sheet} scale={0} resizeObserver={resizeObserver} controller={controller} />,
    )
    expect(node('[data-xlsx-fill-handle]').style.width).toBe('7px')
    view.unmount()
    expect(resizeObserver).toHaveBeenCalledWith(null)
  })
})

describe('useGridSelection', () => {
  /**
   * Mount the hook over a sheet.
   * @param options - the sheet options to build the fixture with.
   * @returns the render-hook result.
   */
  function mountHook(options: SheetOptions = { columns: 3, rows: 3 }) {
    const sheet = makeSheet(options)
    return renderHook(({ pageRows, pageColumns }: { pageRows: number; pageColumns: number }) => (
      useGridSelection(sheet, pageRows, pageColumns, () => {})
    ), { initialProps: { pageRows: 2, pageColumns: 2 } })
  }

  it('moves, extends, and pages with the keyboard', () => {
    const { result } = mountHook()
    const press = presser(result)

    expect(result.current.active).toEqual({ column: 0, row: 0 })
    press('ArrowRight')
    expect(result.current.active).toEqual({ column: 1, row: 0 })
    press('ArrowDown', { shiftKey: true })
    expect(result.current.selection.kind).toBe('cell')
    expect(result.current.selection.anchor).toEqual({ column: 1, row: 0 })
    expect(result.current.selection.focus).toEqual({ column: 1, row: 1 })
    press('ArrowLeft')
    expect(result.current.active).toEqual({ column: 0, row: 1 })
    press('ArrowRight')
    expect(result.current.active).toEqual({ column: 1, row: 1 })
    press('ArrowUp')
    expect(result.current.active).toEqual({ column: 1, row: 0 })
    // Settle the cursor at C1 with no range outstanding before the walk keys.
    press('ArrowRight')
    expect(result.current.active).toEqual({ column: 2, row: 0 })
    press('Tab', { shiftKey: true })
    expect(result.current.active).toEqual({ column: 1, row: 0 })
    press('Tab')
    expect(result.current.active).toEqual({ column: 2, row: 0 })
    press('Enter', { shiftKey: true })
    expect(result.current.active).toEqual({ column: 2, row: 0 })
    press('Enter')
    expect(result.current.active).toEqual({ column: 2, row: 1 })
    press('Home')
    expect(result.current.active).toEqual({ column: 0, row: 1 })
    press('Home', { ctrlKey: true })
    expect(result.current.active).toEqual({ column: 0, row: 0 })
    press('End')
    expect(result.current.active).toEqual({ column: 3, row: 0 })
    press('End', { ctrlKey: true })
    expect(result.current.active).toEqual({ column: 3, row: 3 })
    press('PageDown')
    expect(result.current.active).toEqual({ column: 3, row: 3 })
    press('PageUp')
    expect(result.current.active).toEqual({ column: 3, row: 1 })
    press('PageDown', { altKey: true })
    expect(result.current.active).toEqual({ column: 3, row: 1 })
    press('PageUp', { altKey: true })
    expect(result.current.active).toEqual({ column: 1, row: 1 })
    press('a', { ctrlKey: true })
    expect(result.current.selection.kind).toBe('sheet')
  })

  it('keeps the anchor where a Shift range started', () => {
    const { result } = mountHook()
    const press = presser(result)
    // Walk right twice, then extend back over the start of the range.
    act(() => { result.current.selectPoint({ column: 1, row: 0 }, false) })
    press('ArrowRight', { shiftKey: true })
    expect(result.current.selection.anchor).toEqual({ column: 1, row: 0 })
    expect(result.current.selection.focus).toEqual({ column: 2, row: 0 })
    press('ArrowLeft', { shiftKey: true })
    press('ArrowLeft', { shiftKey: true })
    expect(result.current.selection.anchor).toEqual({ column: 1, row: 0 })
    expect(result.current.selection.focus).toEqual({ column: 0, row: 0 })
  })

  it('ignores keys that are not the grid’s', () => {
    const { result } = mountHook()
    const preventDefault = vi.fn()
    act(() => {
      result.current.onKeyDown({ key: 'F5', preventDefault } as never)
    })
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('extends from the anchor and takes whole bands', () => {
    const { result } = mountHook()
    act(() => { result.current.selectPoint({ column: 1, row: 1 }, false) })
    expect(result.current.selection.anchor).toEqual({ column: 1, row: 1 })
    act(() => { result.current.selectPoint({ column: 2, row: 2 }, true) })
    expect(result.current.selection.anchor).toEqual({ column: 1, row: 1 })
    expect(result.current.selection.focus).toEqual({ column: 2, row: 2 })
    act(() => { result.current.extendTo({ column: 0, row: 0 }) })
    expect(result.current.selection.focus).toEqual({ column: 0, row: 0 })
    act(() => { result.current.selectRow(2, false) })
    expect(result.current.selection.kind).toBe('row')
    act(() => { result.current.selectRow(1, true) })
    expect(result.current.selection.anchor).toEqual({ column: 0, row: 2 })
    act(() => { result.current.selectColumn(2, false) })
    expect(result.current.selection.kind).toBe('column')
    act(() => { result.current.selectColumn(1, true) })
    expect(result.current.selection.anchor).toEqual({ column: 2, row: 0 })
    act(() => { result.current.selectSheet() })
    expect(result.current.selection.kind).toBe('sheet')
  })

  it('resets the selection when the sheet changes', () => {
    const first = makeSheet({ columns: 2, rows: 2 })
    const second = makeSheet({ columns: 2, rows: 2, columnWidths: new Map([[0, 0]]) })
    const { result, rerender } = renderHook(
      ({ sheet }: { sheet: typeof first }) => useGridSelection(sheet, 2, 2, () => {}),
      { initialProps: { sheet: first } },
    )
    act(() => { result.current.selectPoint({ column: 1, row: 1 }, false) })
    expect(result.current.active).toEqual({ column: 1, row: 1 })
    rerender({ sheet: second })
    expect(result.current.active).toEqual({ column: 1, row: 0 })
  })

  it('jumps to a typed reference and refuses a malformed one', () => {
    const { result } = mountHook()
    act(() => { result.current.goTo('B2') })
    expect(result.current.active).toEqual({ column: 1, row: 1 })
    act(() => { result.current.goTo('nonsense') })
    expect(result.current.active).toEqual({ column: 1, row: 1 })
    act(() => { result.current.goTo('ZZ99') })
    expect(result.current.active).toEqual({ column: 3, row: 3 })
  })

  it('binds a fresh selection to the sheet it is handed', () => {
    const { result, rerender } = renderHook(
      ({ sheet }: { sheet: ReturnType<typeof makeSheet> }) => useGridSelection(sheet, 2, 2, () => {}),
      { initialProps: { sheet: makeSheet({ columns: 2, rows: 2 }) } },
    )
    expect(result.current.active).toEqual({ column: 0, row: 0 })
    // A sheet whose first visible column is B puts the selection on B1.
    rerender({ sheet: makeSheet({ columns: 2, rows: 2, columnWidths: new Map([[0, 0]]) }) })
    expect(result.current.active).toEqual({ column: 1, row: 0 })
  })

  it('names a position as its A1 reference', () => {
    expect(pointReference({ column: 0, row: 0 })).toBe('A1')
    expect(pointReference({ column: 26, row: 9 })).toBe('AA10')
  })

  it('steps a page by the size the host reports', () => {
    expect(pageSize(800, 900, 20, 64)).toEqual({ rows: 40, columns: 14 })
    // An unmeasured or degenerate stage still steps by at least one position.
    expect(pageSize(0, 0, 20, 64)).toEqual({ rows: 1, columns: 1 })
  })

  it('carries the cell a press selects into the grid it drives', () => {
    const sheet = makeSheet({ columns: 3, rows: 3 })
    const Console = (): ReactNode => {
      const controller = useGridSelection(sheet, 2, 2, () => {})
      return <SheetGrid sheet={sheet} scale={1} resizeObserver={vi.fn()} controller={controller} />
    }
    render(<Console />)
    fireEvent.pointerDown(node('[data-xlsx-cell="B2"]'))
    expect(node('[data-xlsx-cell="B2"]').getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('[data-xlsx-fill-handle]')).toBeTruthy()
  })
})
