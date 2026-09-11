/**
 * Table presentation.
 *
 * Cells are positioned absolutely from the column widths and row heights the
 * file states, because that is the only layout that keeps a `gridSpan` or
 * `rowSpan` region exactly as wide and tall as the cells it covers.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { PptxTable, PptxTableCell } from '../pptx/model.ts'
import { borderStyle, fillStyle } from './paint.ts'
import { TextFrame } from './TextFrame.tsx'

/** One cell with the position and size its spans give it. */
interface PlacedCell {
  readonly cell: PptxTableCell
  readonly key: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Place every painted cell of a table.
 * @param table - the parsed table.
 * @returns cells that paint something, with absolute offsets inside the frame.
 */
function placeCells(table: PptxTable): readonly PlacedCell[] {
  const columnOffsets: number[] = []
  let running = 0
  for (const width of table.columnWidths) {
    columnOffsets.push(running)
    running += width
  }
  const placed: PlacedCell[] = []
  let y = 0
  for (const [rowIndex, row] of table.rows.entries()) {
    let column = 0
    for (const [cellIndex, cell] of row.cells.entries()) {
      // A merged continuation paints nothing; the region's first cell covers it.
      if (!cell.merged) {
        let width = 0
        for (let span = 0; span < cell.gridSpan; span += 1) {
          width += table.columnWidths[column + span] ?? 0
        }
        let height = 0
        for (let span = 0; span < cell.rowSpan; span += 1) {
          height += table.rows[rowIndex + span]?.height ?? 0
        }
        placed.push({
          cell,
          key: `${rowIndex}-${cellIndex}`,
          x: columnOffsets[column] ?? 0,
          y,
          width,
          height: height === 0 ? row.height : height,
        })
      }
      // A merged continuation still consumes one grid column.
      column += cell.merged ? 1 : cell.gridSpan
    }
    y += row.height
  }
  return placed
}

/** Border sides a cell states. */
function cellBorders(cell: PptxTableCell): CSSProperties {
  return {
    borderTop: borderStyle(cell.borders.top),
    borderLeft: borderStyle(cell.borders.left),
    borderBottom: borderStyle(cell.borders.bottom),
    borderRight: borderStyle(cell.borders.right),
  }
}

/**
 * Render a table graphic frame.
 * @param props - the parsed table.
 * @returns the absolutely positioned cells.
 */
export function TableView({ table }: { readonly table: PptxTable }): ReactNode {
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
      {placeCells(table).map(({ cell, key, x, y, width, height }) => (
        <div
          key={key}
          style={{
            position: 'absolute',
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
            boxSizing: 'border-box',
            overflow: 'hidden',
            ...fillStyle(cell.fill),
            ...cellBorders(cell),
          }}
        >
          {cell.text !== undefined && <TextFrame body={cell.text} />}
        </div>
      ))}
    </div>
  )
}
