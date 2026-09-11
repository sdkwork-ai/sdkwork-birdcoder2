/**
 * SpreadsheetML package → render model.
 *
 * A workbook names its sheets, its shared strings, its style table, and its
 * theme; each sheet then addresses those tables by index. Parsing reads each
 * table once, resolves every cell to the text a reader sees, and converts the
 * sheet's twip-and-character geometry to pixels so the grid needs no further
 * lookups.
 */
import {
  attr, attrNs, child, children, emuToPx, isOle2Container, NS_A, NS_R, parseXml,
  readPartRelationships, readTheme, rootOf, roundPx, targetOf, REL_OFFICE_DOCUMENT, REL_THEME,
  ZipFormatError, ZipPackage,
} from '@deepseek-ai/dsh-client-sdkwork-office'
import type { Relationship, Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import { columnWidthToPx, gridLength, MIN_GRID_COLUMNS, MIN_GRID_ROWS, rowHeightToPx, visibleColumns, visibleRows } from '../render/geometry.ts'
import { MAX_COLUMN_COUNT, MAX_ROW_COUNT } from './excel.ts'
import { formatCellValue, isDateFormat } from './number-format.ts'
import { DEFAULT_CELL_FORMAT, readStyleTable, styleColorContext } from './styles.ts'
import type { StyleTable } from './styles.ts'
import type {
  XlsxCell, XlsxCellFormat, XlsxCellKind, XlsxFreeze, XlsxImage, XlsxMerge, XlsxRow,
  XlsxSheet, XlsxWorkbook,
} from './model.ts'

/** SpreadsheetML main namespace. */
const NS_X = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
/** DrawingML spreadsheet-drawing namespace, used by picture anchors. */
const NS_XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing'

/** The relationship suffix ending a worksheet reference. */
const REL_WORKSHEET = '/relationships/worksheet'
/** The relationship suffix ending a shared-strings reference. */
const REL_SHARED_STRINGS = '/relationships/sharedStrings'
/** The relationship suffix ending a styles reference. */
const REL_STYLES = '/relationships/styles'
/** The relationship suffix ending a drawing reference. */
const REL_DRAWING = '/relationships/drawing'
/** The relationship suffix ending a hyperlink reference. */
const REL_HYPERLINK = '/relationships/hyperlink'

/** Why a package could not be rendered. */
export type XlsxFailureCode = 'legacy-binary' | 'not-a-package' | 'no-workbook'

/** A parse failure the preview renders as a specific explanation. */
export class XlsxParseError extends Error {
  constructor(readonly code: XlsxFailureCode, message: string) {
    super(message)
    this.name = 'XlsxParseError'
  }
}

/** Localized strings parsing needs before any component renders. */
export interface XlsxLabels {
  /**
   * Sheet display name fallback for a 1-based position.
   * @param index - sheet position.
   * @returns the visible name.
   */
  readonly sheetName: (index: number) => string
}

/** A parsed workbook plus the resource release the preview must run on unmount. */
export interface ParsedXlsx {
  readonly workbook: XlsxWorkbook
  /** Revoke every Blob URL created for this workbook. */
  readonly dispose: () => void
}



/**
 * The column letters for a 0-based column index.
 * @param index - the 0-based column.
 * @returns the A1-style column name.
 */
export function columnName(index: number): string {
  let remaining = index
  let name = ''
  do {
    name = String.fromCharCode(65 + (remaining % 26)) + name
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)
  return name
}

/**
 * Parse an A1-style reference.
 * @param reference - the reference, without a sheet qualifier.
 * @returns the 0-based column and row, or undefined when unparseable.
 */
export function parseReference(reference: string): { readonly column: number; readonly row: number } | undefined {
  const match = /^([A-Z]+)(\d+)$/u.exec(reference.trim().toUpperCase())
  if (match === null) return undefined
  let column = 0
  for (const character of match[1]) column = column * 26 + (character.charCodeAt(0) - 64)
  return { column: column - 1, row: Number(match[2]) - 1 }
}

/** The pixel ruler a sheet's drawings are placed against. */
interface GridGeometry {
  columnOffset: (column: number) => number
  rowOffset: (row: number) => number
}

/**
 * Build the cumulative pixel rulers a sheet's drawings are placed against.
 *
 * The offsets are memoised per call, so anchoring a picture near the sheet's
 * foot costs the columns before it rather than a materialised array.
 * @param widths - the columns that state a width.
 * @param heights - the rows that state a height.
 * @param defaultColumnWidth - the width for columns that state none.
 * @param defaultRowHeight - the height for rows that state none.
 * @returns the sheet geometry.
 */
function buildGeometry(
  widths: ReadonlyMap<number, number>,
  heights: ReadonlyMap<number, number>,
  defaultColumnWidth: number,
  defaultRowHeight: number,
): GridGeometry {
  const columns: number[] = []
  const rows: number[] = []
  const walk = (
    offsets: number[],
    sizes: ReadonlyMap<number, number>,
    fallback: number,
    target: number,
  ): number => {
    if (target < 0) return 0
    let offset = offsets.at(-1) ?? 0
    for (let index = offsets.length; index <= target; index += 1) {
      offsets.push(offset)
      offset += sizes.get(index) ?? fallback
    }
    return offsets.at(target) ?? 0
  }
  return {
    columnOffset: column => walk(columns, widths, defaultColumnWidth, column),
    rowOffset: row => walk(rows, heights, defaultRowHeight, row),
  }
}

/**
 * The view attributes a worksheet states.
 *
 * `sheetView` carries what the reader sees before any cell does: whether the
 * sheet paints gridlines, shows its headers, and what zoom it was saved at.
 */
export interface XlsxSheetView {
  readonly showGridLines: boolean
  readonly showHeaders: boolean
  /** The sheet's saved zoom, as a multiple of actual size. */
  readonly zoomScale: number
}

/** The view a worksheet shows when it states none. */
export const DEFAULT_SHEET_VIEW: XlsxSheetView = {
  showGridLines: true,
  showHeaders: true,
  zoomScale: 1,
}

/**
 * Read a worksheet's own view attributes.
 * @param root - the `worksheet` root element.
 * @returns the resolved view.
 */
function readSheetView(root: Element): XlsxSheetView {
  const view = child(child(root, NS_X, 'sheetViews'), NS_X, 'sheetView')
  if (view === undefined) return DEFAULT_SHEET_VIEW
  const zoom = Number(attr(view, 'zoomScale') ?? 100)
  return {
    showGridLines: attr(view, 'showGridLines') !== '0',
    showHeaders: attr(view, 'showRowColHeaders') !== '0',
    zoomScale: Number.isFinite(zoom) && zoom > 0 ? zoom / 100 : 1,
  }
}

/** The shared strings a workbook declares, resolved once. */
async function readSharedStrings(pkg: ZipPackage, part: string | undefined): Promise<readonly string[]> {
  if (part === undefined) return []
  const text = await pkg.readText(part)
  if (text === undefined) return []
  const root = rootOf(parseXml(text, part))
  return children(root, NS_X, 'si').map(entry => children(entry, NS_X, 't')
    .map(node => node.textContent || '')
    .join(''))
}

/**
 * Read the value and kind a cell element holds.
 * @param cell - the `c` element.
 * @param sharedStrings - the workbook's shared string table.
 * @returns the raw text, the display value, and the cell kind.
 */
function readCellValue(
  cell: Element,
  sharedStrings: readonly string[],
): { readonly raw: string; readonly value: number | string | boolean; readonly kind: XlsxCellKind } {
  const type = attr(cell, 't') ?? 'n'
  if (type === 'inlineStr') {
    const text = children(child(cell, NS_X, 'is'), NS_X, 't').map(node => node.textContent || '').join('')
    return { raw: text, value: text, kind: 'string' }
  }
  const raw = child(cell, NS_X, 'v')?.textContent ?? ''
  switch (type) {
    case 's': {
      const shared = sharedStrings.at(Number(raw))
      return { raw: shared ?? '', value: shared ?? '', kind: 'string' }
    }
    case 'str':
      return { raw, value: raw, kind: 'string' }
    case 'b':
      return { raw: raw === '1' ? 'TRUE' : 'FALSE', value: raw === '1', kind: 'boolean' }
    case 'e':
      return { raw, value: raw, kind: 'error' }
    case 'd':
      return { raw, value: raw, kind: 'string' }
    default: {
      const numeric = Number(raw)
      if (raw !== '' && Number.isFinite(numeric)) return { raw, value: numeric, kind: 'number' }
      return { raw, value: raw, kind: raw === '' ? 'empty' : 'string' }
    }
  }
}

/**
 * Read the columns a worksheet declares.
 * @param root - the `worksheet` root element.
 * @returns widths in pixels, plus the default width.
 */
function readColumns(root: Element): { readonly widths: Map<number, number>; readonly defaultWidth: number } {
  const widths = new Map<number, number>()
  const format = child(root, NS_X, 'sheetFormatPr')
  const defaultCharacters = Number(attr(format, 'defaultColWidth') ?? attr(format, 'baseColWidth') ?? 8.43)
  for (const column of children(child(root, NS_X, 'cols'), NS_X, 'col')) {
    const min = Number(attr(column, 'min') ?? 1)
    const max = Number(attr(column, 'max') ?? min)
    const hidden = attr(column, 'hidden') === '1'
    const width = hidden ? 0 : columnWidthToPx(Number(attr(column, 'width') ?? defaultCharacters))
    for (let index = min - 1; index <= max - 1; index += 1) widths.set(index, width)
  }
  return { widths, defaultWidth: columnWidthToPx(defaultCharacters) }
}

/**
 * Read a worksheet's frozen pane, if it has one.
 * @param root - the `worksheet` root element.
 * @returns the frozen row and column counts.
 */
function readFreeze(root: Element): XlsxFreeze {
  const pane = child(child(child(root, NS_X, 'sheetViews'), NS_X, 'sheetView'), NS_X, 'pane')
  if (pane === undefined || attr(pane, 'state') !== 'frozen') return { rows: 0, columns: 0 }
  return {
    rows: Math.round(Number(attr(pane, 'ySplit') ?? 0)),
    columns: Math.round(Number(attr(pane, 'xSplit') ?? 0)),
  }
}

/**
 * Read a worksheet's merge regions.
 * @param root - the `worksheet` root element.
 * @returns the merge regions in grid coordinates.
 */
function readMerges(root: Element): readonly XlsxMerge[] {
  const merges: XlsxMerge[] = []
  for (const entry of children(child(root, NS_X, 'mergeCells'), NS_X, 'mergeCell')) {
    const reference = attr(entry, 'ref')
    if (reference === undefined) continue
    const parts = reference.split(':')
    const start = parts.at(0)
    const end = parts.at(1)
    const from = start === undefined ? undefined : parseReference(start)
    const to = start === undefined ? undefined : parseReference(end ?? start)
    if (from === undefined || to === undefined) continue
    merges.push({ top: from.row, left: from.column, bottom: to.row, right: to.column })
  }
  return merges
}

/**
 * Read the hyperlinks a worksheet declares.
 * @param root - the `worksheet` root element.
 * @param relationships - the sheet's relationships.
 * @returns targets by A1 reference.
 */
function readHyperlinks(root: Element, relationships: ReadonlyMap<string, Relationship>): ReadonlyMap<string, string> {
  const targets = new Map<string, string>()
  for (const entry of children(child(root, NS_X, 'hyperlinks'), NS_X, 'hyperlink')) {
    const reference = attr(entry, 'ref')
    if (reference === undefined) continue
    const id = attrNs(entry, NS_R, 'id')
    const relationship = id === undefined ? undefined : relationships.get(id)
    const location = attr(entry, 'location')
    const target = relationship !== undefined && relationship.type.endsWith(REL_HYPERLINK)
      ? relationship.target
      : location === undefined ? undefined : `#${location}`
    if (target !== undefined) targets.set(reference.split(':').at(0) ?? reference, target)
  }
  return targets
}

/**
 * Read the pictures a worksheet's drawing part anchors to the grid.
 * @param pkg - the open package.
 * @param drawingPart - the drawing part name, when the sheet has one.
 * @param geometry - the sheet's resolved geometry.
 * @param resolveMedia - media part name to Blob URL.
 * @returns the placed images.
 */
async function readDrawings(
  pkg: ZipPackage,
  drawingPart: string | undefined,
  geometry: GridGeometry,
  resolveMedia: (partName: string) => Promise<string | undefined>,
): Promise<readonly XlsxImage[]> {  if (drawingPart === undefined) return []
  const text = await pkg.readText(drawingPart)
  if (text === undefined) return []
  const root = rootOf(parseXml(text, drawingPart))
  const relationships = await readPartRelationships(pkg, drawingPart)
  const images: XlsxImage[] = []
  for (const anchor of children(root, NS_XDR)) {
    if (anchor.localName !== 'twoCellAnchor' && anchor.localName !== 'oneCellAnchor') continue
    const blip = children(anchor, NS_XDR)
      .flatMap(node => Array.from(node.getElementsByTagNameNS(NS_A, 'blip')))
      .at(0)
    const target = targetOf(relationships, attrNs(blip, NS_R, 'embed'), '/relationships/image')
    const url = target === undefined ? undefined : await resolveMedia(target)
    if (url === undefined) continue
    const from = child(anchor, NS_XDR, 'from')
    const column = Number(attr(child(from, NS_XDR, 'col'), 'val') ?? 0)
    const rowIndex = Number(attr(child(from, NS_XDR, 'row'), 'val') ?? 0)
    const columnOff = emuToPx(Number(attr(child(from, NS_XDR, 'colOff'), 'val') ?? 0))
    const rowOff = emuToPx(Number(attr(child(from, NS_XDR, 'rowOff'), 'val') ?? 0))
    const x = geometry.columnOffset(column) + columnOff
    const y = geometry.rowOffset(rowIndex) + rowOff
    const to = child(anchor, NS_XDR, 'to')
    if (to !== undefined) {
      const toColumn = Number(attr(child(to, NS_XDR, 'col'), 'val') ?? column)
      const toRow = Number(attr(child(to, NS_XDR, 'row'), 'val') ?? rowIndex)
      const toColumnOff = emuToPx(Number(attr(child(to, NS_XDR, 'colOff'), 'val') ?? 0))
      const toRowOff = emuToPx(Number(attr(child(to, NS_XDR, 'rowOff'), 'val') ?? 0))
      images.push({
        src: url,
        x: roundPx(x),
        y: roundPx(y),
        width: roundPx(Math.max(1, geometry.columnOffset(toColumn) + toColumnOff - x)),
        height: roundPx(Math.max(1, geometry.rowOffset(toRow) + toRowOff - y)),
      })
      continue
    }
    const extent = child(anchor, NS_XDR, 'ext')
    images.push({
      src: url,
      x: roundPx(x),
      y: roundPx(y),
      width: roundPx(emuToPx(Number(attr(extent, 'cx') ?? 0))),
      height: roundPx(emuToPx(Number(attr(extent, 'cy') ?? 0))),
    })
  }
  return images
}


/**
 * Parse one worksheet into the render model the grid draws.
 * @param pkg - the open package.
 * @param partName - the worksheet part name.
 * @param sheet - the sheet's 1-based position and visible name.
 * @param styles - the workbook's style table.
 * @param sharedStrings - the workbook's shared string table.
 * @param date1904 - whether the workbook uses the 1904 date system.
 * @param defaultZoom - the workbook's own view zoom, which the sheet's view multiplies.
 * @returns the parsed sheet.
 */
async function readSheet(
  pkg: ZipPackage,
  partName: string,
  sheet: { readonly index: number; readonly name: string },
  styles: StyleTable,
  sharedStrings: readonly string[],
  date1904: boolean,
  defaultZoom: number,
  resolveMedia: (partName: string) => Promise<string | undefined>,
): Promise<XlsxSheet> {
  const text = await pkg.readText(partName)
  if (text === undefined) throw new XlsxParseError('no-workbook', `missing part ${partName}`)
  const root = rootOf(parseXml(text, partName))
  const relationships = await readPartRelationships(pkg, partName)
  const { widths, defaultWidth } = readColumns(root)
  const format = child(root, NS_X, 'sheetFormatPr')
  const defaultRowHeight = rowHeightToPx(Number(attr(format, 'defaultRowHeight') ?? 15))
  const rowHeights = new Map<number, number>()
  const hyperlinks = readHyperlinks(root, relationships)
  const rows: XlsxRow[] = []
  let maxColumn = 0

  for (const rowNode of children(child(root, NS_X, 'sheetData'), NS_X, 'row')) {
    const index = Number(attr(rowNode, 'r') ?? rows.length + 1) - 1
    const hidden = attr(rowNode, 'hidden') === '1'
    const height = hidden ? 0 : rowHeightToPx(Number(attr(rowNode, 'ht') ?? attr(format, 'defaultRowHeight') ?? 15))
    if (attr(rowNode, 'ht') !== undefined || hidden) rowHeights.set(index, height)
    const cells: XlsxCell[] = []
    for (const cellNode of children(rowNode, NS_X, 'c')) {
      const reference = attr(cellNode, 'r') ?? ''
      const position = parseReference(reference)
      if (position === undefined) continue
      maxColumn = Math.max(maxColumn, position.column)
      const styleIndex = Number(attr(cellNode, 's') ?? 0)
      const cellFormat: XlsxCellFormat = styles.formats.at(styleIndex) ?? DEFAULT_CELL_FORMAT
      const { raw, value, kind } = readCellValue(cellNode, sharedStrings)
      const formula = child(cellNode, NS_X, 'f')?.textContent ?? undefined
      const hyperlink = hyperlinks.get(reference)
      if (kind === 'empty' && formula === undefined) continue
      const isDate = kind === 'number' && isDateFormat(cellFormat.numberFormat)
      const display = kind === 'number' || kind === 'boolean' || kind === 'string'
        ? formatCellValue(value, cellFormat.numberFormat, date1904)
        : raw
      cells.push({
        column: position.column,
        reference,
        text: display,
        raw,
        ...(formula === undefined ? {} : { formula }),
        kind: isDate ? 'date' : kind,
        format: cellFormat,
        ...(hyperlink === undefined ? {} : { hyperlink }),
      })
    }
    rows.push({ index, height, cells })
  }

  const merges = readMerges(root)
  const extent = {
    columns: Math.max(maxColumn, merges.reduce((widest, merge) => Math.max(widest, merge.right), 0), 0),
    rows: Math.max(rows.reduce((lowest, row) => Math.max(lowest, row.index), 0),
      merges.reduce((lowest, merge) => Math.max(lowest, merge.bottom), 0), 0),
  }
  const geometry = buildGeometry(widths, rowHeights, defaultWidth, defaultRowHeight)
  const drawingId = attrNs(child(root, NS_X, 'drawing'), NS_R, 'id')
  const view = readSheetView(root)
  // The grid walks an empty tail past the content so the surface fills the
  // window whatever the workbook holds; `extent` still names the used range, so
  // `Ctrl+End` and `Ctrl+A` stay on the cells the file actually wrote.
  const columns = visibleColumns(
    gridLength(extent.columns + 1, MIN_GRID_COLUMNS, MAX_COLUMN_COUNT) - 1,
    widths,
  )
  const visible = visibleRows(
    gridLength(extent.rows + 1, MIN_GRID_ROWS, MAX_ROW_COUNT) - 1,
    rowHeights,
  )
  return {
    index: sheet.index,
    name: sheet.name,
    rows,
    rowMap: new Map(rows.map(row => [row.index, row])),
    columnWidths: widths,
    rowHeights,
    defaultColumnWidth: defaultWidth,
    defaultRowHeight,
    merges,
    freeze: readFreeze(root),
    images: await readDrawings(
      pkg,
      targetOf(relationships, drawingId, REL_DRAWING),
      geometry,
      resolveMedia,
    ),
    index2d: {
      columns,
      rows: visible,
      columnPosition: new Map(columns.map((column, position) => [column, position])),
      rowPosition: new Map(visible.map((row, position) => [row, position])),
    },
    showGridLines: view.showGridLines,
    showHeaders: view.showHeaders,
    zoomScale: view.zoomScale * defaultZoom,
    extent,
  }
}

/**
 * Parse a workbook package into a render model.
 * @param bytes - the complete file.
 * @param labels - localized strings the parse itself needs.
 * @returns the workbook and the Blob URL release to run on unmount.
 * @throws {XlsxParseError} when the file is not a renderable OOXML workbook.
 */
export async function parseXlsx(bytes: Uint8Array, labels: XlsxLabels): Promise<ParsedXlsx> {
  if (isOle2Container(bytes)) {
    throw new XlsxParseError('legacy-binary', 'Excel 97-2003 binary workbook')
  }
  let pkg: ZipPackage
  try {
    pkg = ZipPackage.open(bytes)
  } catch (error) {
    if (error instanceof ZipFormatError) throw new XlsxParseError('not-a-package', error.message)
    throw error
  }

  const media = new Map<string, string>()
  const resolveMedia = async (partName: string): Promise<string | undefined> => {
    const cached = media.get(partName)
    if (cached !== undefined) return cached
    const data = await pkg.read(partName)
    if (data === undefined) return undefined
    const name = partName.slice(partName.lastIndexOf('.') + 1).toLowerCase()
    const type = name === 'png' ? 'image/png'
      : name === 'gif' ? 'image/gif'
        : name === 'bmp' ? 'image/bmp'
          : name === 'svg' ? 'image/svg+xml'
            : name === 'webp' ? 'image/webp' : 'image/jpeg'
    const url = URL.createObjectURL(new Blob([data.slice()], { type }))
    media.set(partName, url)
    return url
  }

  const packageRels = await readPartRelationships(pkg, '')
  const workbookPart = [...packageRels.values()]
    .find(relationship => relationship.type.endsWith(REL_OFFICE_DOCUMENT))?.target
  const workbookText = workbookPart === undefined ? undefined : await pkg.readText(workbookPart)
  if (workbookPart === undefined || workbookText === undefined) {
    throw new XlsxParseError('no-workbook', 'package names no readable workbook part')
  }
  const workbookRoot = rootOf(parseXml(workbookText, workbookPart))
  const workbookRels = await readPartRelationships(pkg, workbookPart)
  const date1904 = attr(child(workbookRoot, NS_X, 'workbookPr'), 'date1904') === '1'

  const themePart = [...workbookRels.values()]
    .find(relationship => !relationship.external && relationship.type.endsWith(REL_THEME))?.target
  const themeText = themePart === undefined ? undefined : await pkg.readText(themePart)
  const theme: Theme | undefined = themeText === undefined || themePart === undefined
    ? undefined
    : readTheme(rootOf(parseXml(themeText, themePart)))

  const stylesPart = [...workbookRels.values()]
    .find(relationship => relationship.type.endsWith(REL_STYLES))?.target
  const stylesText = stylesPart === undefined ? undefined : await pkg.readText(stylesPart)
  const styles = readStyleTable(
    stylesText === undefined || stylesPart === undefined ? undefined : rootOf(parseXml(stylesText, stylesPart)),
    styleColorContext(theme),
  )

  const sharedStringsPart = [...workbookRels.values()]
    .find(relationship => relationship.type.endsWith(REL_SHARED_STRINGS))?.target
  const sharedStrings = await readSharedStrings(pkg, sharedStringsPart)

  const sheets: XlsxSheet[] = []
  const sheetNodes = children(child(workbookRoot, NS_X, 'sheets'), NS_X, 'sheet')
  // The workbook's own view states the zoom every sheet inherits before its
  // own `sheetView` overrides it.
  const workbookZoom = ((): number => {
    const raw = Number(attr(child(child(workbookRoot, NS_X, 'bookViews'), NS_X, 'workbookView'), 'zoomScale') ?? 100)
    return Number.isFinite(raw) && raw > 0 ? raw / 100 : 1
  })()
  for (const [position, sheetNode] of sheetNodes.entries()) {
    const partName = targetOf(workbookRels, attrNs(sheetNode, NS_R, 'id'), REL_WORKSHEET)
    if (partName === undefined) continue
    sheets.push(await readSheet(
      pkg,
      partName,
      {
        index: position + 1,
        name: attr(sheetNode, 'name')?.trim() || labels.sheetName(position + 1),
      },
      styles,
      sharedStrings,
      date1904,
      workbookZoom,
      resolveMedia,
    ))
  }
  if (sheets.length === 0) throw new XlsxParseError('no-workbook', 'workbook contains no sheets')

  return {
    workbook: { sheets, date1904 },
    dispose: () => {
      for (const url of media.values()) URL.revokeObjectURL(url)
      media.clear()
    },
  }
}
