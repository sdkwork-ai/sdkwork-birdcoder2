/**
 * The render model a parsed workbook becomes.
 *
 * A worksheet is a sparse grid: only cells that carry a value or a style are
 * stored, and every geometric value is already in CSS pixels. Number formatting
 * is applied during parsing, so a cell carries both the text the reader sees and
 * the raw value the formula bar shows.
 *
 * The grid draws the columns and rows a sheet actually shows rather than every
 * position up to its extent: `index2d` lists the visible positions in order, so
 * a sheet that hides a column or carries a hundred thousand populated rows lays
 * out without materialising the gap.
 */
import type { CssColor } from '@deepseek-ai/dsh-client-sdkwork-office'

/** A run of text styling resolved from the workbook's font table. */
export interface XlsxFont {
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: boolean
  readonly strike: boolean
  readonly sizePx: number
  readonly family: string
  readonly color?: CssColor
}

/** One side of a cell border. */
export interface XlsxBorderSide {
  readonly color: CssColor
  readonly widthPx: number
  readonly dashed: boolean
}

/** The four sides of a cell border; a side is absent when the cell draws none. */
export interface XlsxBorders {
  readonly top?: XlsxBorderSide
  readonly right?: XlsxBorderSide
  readonly bottom?: XlsxBorderSide
  readonly left?: XlsxBorderSide
}

/** Horizontal alignment as OOXML names it. */
export type XlsxHorizontalAlign = 'general' | 'left' | 'center' | 'right' | 'fill' | 'justify'

/** Vertical alignment as OOXML names it. */
export type XlsxVerticalAlign = 'top' | 'center' | 'bottom' | 'justify'

/** How a cell places its content. */
export interface XlsxAlignment {
  readonly horizontal: XlsxHorizontalAlign
  readonly vertical: XlsxVerticalAlign
  readonly wrapText: boolean
  /** Indent steps, each one character wide. */
  readonly indent: number
  /** Text rotation in degrees, clockwise. */
  readonly rotation: number
}

/** Everything a cell's style index resolves to. */
export interface XlsxCellFormat {
  readonly font: XlsxFont
  /** Solid fill colour, when the cell paints one. */
  readonly fill?: CssColor
  readonly borders: XlsxBorders
  readonly alignment: XlsxAlignment
  /** The display code, after builtin and custom number formats are unified. */
  readonly numberFormat: string
}

/** What a cell holds, after its type attribute is applied. */
export type XlsxCellKind = 'number' | 'string' | 'boolean' | 'error' | 'date' | 'empty'

/** One populated cell. */
export interface XlsxCell {
  /** 0-based column. */
  readonly column: number
  /** A1-style reference, for the formula bar and cell selection. */
  readonly reference: string
  /** Text after number formatting. */
  readonly text: string
  /** The stored value, unformatted, for the formula bar. */
  readonly raw: string
  readonly formula?: string
  readonly kind: XlsxCellKind
  readonly format: XlsxCellFormat
  /** External target when the cell is a hyperlink. */
  readonly hyperlink?: string
  /** The merge region this cell starts, when it does. */
  readonly merge?: XlsxMerge
}

/** One row's populated cells. */
export interface XlsxRow {
  /** 0-based row. */
  readonly index: number
  readonly height: number
  readonly cells: readonly XlsxCell[]
}

/** A rectangular merge region, in 0-based grid coordinates. */
export interface XlsxMerge {
  readonly top: number
  readonly left: number
  readonly bottom: number
  readonly right: number
}

/** A picture anchored to the grid, already resolved to page pixels. */
export interface XlsxImage {
  readonly src: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The frozen region a sheet view keeps in place. */
export interface XlsxFreeze {
  readonly rows: number
  readonly columns: number
}

/** The worksheet positions a render walks, in display order. */
export interface XlsxGridIndex {
  /** Visible column positions, ascending. */
  readonly columns: readonly number[]
  /** Visible row positions, ascending. */
  readonly rows: readonly number[]
  /** Visible position of a column, or undefined when the column is hidden. */
  readonly columnPosition: ReadonlyMap<number, number>
  /** Visible position of a row, or undefined when the row is hidden. */
  readonly rowPosition: ReadonlyMap<number, number>
}

/** One worksheet, ready to draw. */
export interface XlsxSheet {
  readonly index: number
  readonly name: string
  readonly rows: readonly XlsxRow[]
  /** Row lookup by 0-based position, so a virtual window costs one probe. */
  readonly rowMap: ReadonlyMap<number, XlsxRow>
  /** Column widths in pixels, by 0-based column, for columns that state one. */
  readonly columnWidths: ReadonlyMap<number, number>
  readonly defaultColumnWidth: number
  /** Row heights in pixels, by 0-based row, for rows that state one. */
  readonly rowHeights: ReadonlyMap<number, number>
  readonly defaultRowHeight: number
  readonly merges: readonly XlsxMerge[]
  readonly freeze: XlsxFreeze
  readonly images: readonly XlsxImage[]
  /**
   * The visible positions the grid walks.
   *
   * A hidden column or row is absent, including the whole tail below or beside
   * the sheet: the populated extent bounds the grid, so a sheet with three rows
   * does not lay out a million.
   */
  readonly index2d: XlsxGridIndex
  /** Whether the sheet draws gridlines, as its own view states. */
  readonly showGridLines: boolean
  /** Whether the sheet shows its row and column headers. */
  readonly showHeaders: boolean
  /** The sheet's own zoom percentage, applied before the viewer's. */
  readonly zoomScale: number
  /** The last column and row that carry content, for the grid extent. */
  readonly extent: { readonly columns: number; readonly rows: number }
}

/** A parsed workbook, ready to draw. */
export interface XlsxWorkbook {
  readonly sheets: readonly XlsxSheet[]
  /** Whether serial numbers count from 1904 rather than 1900. */
  readonly date1904: boolean
}

/**
 * Look a row up by its 0-based position.
 * @param sheet - the sheet to read.
 * @param row - the 0-based row.
 * @returns the row, or undefined when it carries nothing.
 */
export function rowAt(sheet: XlsxSheet, row: number): XlsxRow | undefined {
  return sheet.rowMap.get(row)
}
