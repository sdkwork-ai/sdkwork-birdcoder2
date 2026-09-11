/**
 * Table presentation.
 *
 * A Word table is already resolved to explicit spans and column widths, so it
 * is drawn as a real HTML table: the browser then owns cell placement, nested
 * tables included. The grid only fixes the column widths the file states; a
 * table without a declared grid falls back to automatic layout. An exact row
 * height clips the cell the way Word does; an at-least height lets the row
 * grow.
 */
import { roundPx } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { CSSProperties, ReactNode } from 'react'
import type { DocxTable, DocxTableCell } from '../docx/model.ts'
import { borderStyle, shadingStyle, tableAlignStyle } from './paint.ts'
import type { PageContext } from './InlineView.tsx'
import { BlockView, flowTopMargins } from './BlockView.tsx'

/**
 * One cell's own paint.
 * @param cell - the placed cell.
 * @param tableMargin - the table's default cell padding.
 * @returns the CSS properties the cell paints with.
 */
type CellMargins = { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number }

function cellStyle(cell: DocxTableCell, tableMargin: CellMargins): CSSProperties {
  const margin = cell.cellMargin ?? tableMargin
  return {
    verticalAlign: cell.verticalAlign,
    ...borderStyle(cell.borders),
    ...shadingStyle(cell.shading),
    padding: `${roundPx(margin.top)}px ${roundPx(margin.right)}px ${roundPx(margin.bottom)}px ${roundPx(margin.left)}px`,
  }
}

/**
 * Draw one table.
 * @param props - the table and the page it is drawn on.
 * @returns the table element with every cell placed.
 */
export function TableView({ table, pageContext }: {
  readonly table: DocxTable
  readonly pageContext: PageContext
}): ReactNode {
  const gridWidth = table.columns.reduce((total, column) => total + column, 0)
  // Word's default is autofit: the declared column widths are preferences and
  // content may stretch them, so an unfixed table states no total width. A
  // table with an auto width hugs its content entirely, dropping the grid
  // hints, the way Word sizes such a table to its text.
  const declaredWidth = table.widthPct === undefined && table.widthAuto !== true && table.columns.length > 0
  const width = table.widthPct !== undefined
    ? `${roundPx(table.widthPct / 50)}%`
    : table.fixedLayout === true && table.columns.length > 0 ? `${roundPx(gridWidth)}px` : undefined
  const contentFit = table.widthAuto === true && table.fixedLayout !== true
  return (
    <table
      data-docx-block
      style={{
        borderCollapse: 'collapse',
        tableLayout: table.fixedLayout === true && table.columns.length > 0 ? 'fixed' : 'auto',
        marginLeft: table.align === 'left' && table.indentPx !== 0 ? `${roundPx(table.indentPx)}px` : undefined,
        width,
        minWidth: declaredWidth && table.fixedLayout !== true ? `${roundPx(gridWidth)}px` : undefined,
        ...tableAlignStyle(table.align),
        ...borderStyle(table.borders),
      }}
    >
      {table.columns.length > 0 && !contentFit && (
        <colgroup>
          {table.columns.map((column, columnIndex) => (
            <col
              key={columnIndex}
              style={table.widthPct === undefined
                ? { width: `${roundPx(column)}px` }
                : { width: `${gridWidth > 0 ? roundPx(column / gridWidth * 10000) / 100 : 100 / table.columns.length}%` }}
            />
          ))}
        </colgroup>
      )}
      <tbody>
        {table.rows.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            style={row.heightPx === undefined ? undefined : {
              height: `${roundPx(row.heightPx)}px`,
            }}
          >
            {row.cells.map((cell, cellIndex) => {
              const margins = flowTopMargins(cell.blocks, false)
              const exact = row.heightRule === 'exact'
              return (
                <td
                  key={cellIndex}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  style={{
                    ...cellStyle(cell, table.cellMargin),
                    ...(exact ? { height: `${roundPx(row.heightPx ?? 0)}px`, overflow: 'hidden' } : {}),
                  }}
                >
                  {exact ? (
                    <div style={{ height: `${roundPx(row.heightPx ?? 0)}px`, overflow: 'hidden' }}>
                      {cell.blocks.map((block, blockIndex) => (
                        <BlockView
                          key={blockIndex}
                          block={block}
                          topMargin={margins[blockIndex] ?? 0}
                          pageContext={pageContext}
                        />
                      ))}
                    </div>
                  ) : cell.blocks.map((block, blockIndex) => (
                    <BlockView
                      key={blockIndex}
                      block={block}
                      topMargin={margins[blockIndex] ?? 0}
                      pageContext={pageContext}
                    />
                  ))}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
