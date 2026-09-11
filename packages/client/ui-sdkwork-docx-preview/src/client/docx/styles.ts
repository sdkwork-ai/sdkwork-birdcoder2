/**
 * The WordprocessingML styles cascade.
 *
 * A style states its overrides and names the style it derives from, so the
 * value a paragraph actually sees is the merge of `docDefaults`, every style
 * on the `w:basedOn` chain, and the properties written directly on the
 * paragraph. The chain is resolved once per style and memoized; a cycle stops
 * following at the point it repeats, which leaves a malformed document
 * readable instead of hanging the preview.
 */
import { child, children } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { CssColor, Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { DocxBorders } from './model.ts'
import type { ParaFormat, RunFormat, TableFormat } from './format.ts'
import { mergePara, mergeRun, readBorders, readParaFormat, readRunFormat, readShading, readTableFormat } from './format.ts'
import { NS_W, wAttr, wFlag } from './names.ts'

/** One style's own stated properties and the style it derives from. */
interface StyleEntry {
  readonly basedOn?: string
  readonly para: ParaFormat
  readonly run: RunFormat
  readonly table: TableFormat
  /** `w:tblStylePr` conditional formats, keyed by the band they decorate. */
  readonly bands: Partial<Record<TableBandKey, TableBandFormat>>
}

/** The conditional areas a table style can decorate. */
export type TableBandKey =
  | 'firstRow' | 'lastRow' | 'firstCol' | 'lastCol'
  | 'band1Horz' | 'band2Horz' | 'band1Vert' | 'band2Vert'

/** The paint one conditional band lays over the cells it covers. */
export interface TableBandFormat {
  readonly run: RunFormat
  readonly shading?: CssColor
  readonly borders?: DocxBorders
}

/** A table style resolved through its `basedOn` chain. */
export interface ResolvedTable {
  readonly table: TableFormat
  readonly bands: Partial<Record<TableBandKey, TableBandFormat>>
}

/** A style chain resolved from the document defaults upwards. */
export interface ResolvedStyle {
  readonly para: ParaFormat
  readonly run: RunFormat
  readonly table: TableFormat
}

/** Resolves style ids to the values a paragraph, run, or table inherits. */
export interface StyleResolver {
  /** The values every style chain starts from. */
  readonly defaults: ResolvedStyle
  /**
   * Resolve a paragraph style.
   * @param id - `w:pStyle` value, or undefined for the document's default paragraph style.
   * @returns the merged paragraph and run formats.
   */
  paragraph(id: string | undefined): ResolvedStyle
  /**
   * Resolve a character style.
   * @param id - `w:rStyle` value, or undefined for the document's default character style.
   * @returns the merged run format.
   */
  character(id: string | undefined): RunFormat
  /**
   * Resolve a table style.
   * @param id - `w:tblStyle` value, or undefined for the document's default table style.
   * @returns the merged table format and its conditional bands.
   */
  table(id: string | undefined): ResolvedTable
}

/** An empty resolver for a package with no style part. */
const NO_STYLES: StyleResolver = {
  defaults: { para: {}, run: {}, table: {} },
  paragraph: () => NO_STYLES.defaults,
  character: () => ({}),
  table: () => ({ table: {}, bands: {} }),
}

/**
 * Read one `w:tblStylePr` conditional band.
 * @param element - the band element.
 * @param theme - the document theme.
 * @returns the band's paint, or undefined when it states none.
 */
function readBand(element: Element, theme: Theme): TableBandFormat | undefined {
  const run = readRunFormat(child(element, NS_W, 'rPr'), theme)
  const cell = child(element, NS_W, 'tcPr')
  const shading = readShading(child(cell, NS_W, 'shd'), theme)
  const borders = readBorders(child(cell, NS_W, 'tcBorders'), theme)
  if (Object.keys(run).length === 0 && shading === undefined && borders === undefined) return undefined
  return {
    run,
    ...(shading === undefined ? {} : { shading }),
    ...(borders === undefined ? {} : { borders }),
  }
}

/** Every conditional band name `w:tblStylePr/@w:type` states. */
const BAND_KEYS: readonly TableBandKey[] = [
  'firstRow', 'lastRow', 'firstCol', 'lastCol', 'band1Horz', 'band2Horz', 'band1Vert', 'band2Vert',
]

/**
 * Collect a table style's conditional bands.
 * @param element - the `w:style` element.
 * @param theme - the document theme.
 * @returns the bands the style states, by key.
 */
function readBands(element: Element, theme: Theme): Partial<Record<TableBandKey, TableBandFormat>> {
  const bands: Partial<Record<TableBandKey, TableBandFormat>> = {}
  for (const band of children(element, NS_W, 'tblStylePr')) {
    const key = wAttr(band, 'type') as TableBandKey | undefined
    if (key === undefined || !BAND_KEYS.includes(key)) continue
    const format = readBand(band, theme)
    if (format !== undefined) bands[key] = format
  }
  return bands
}

/**
 * Read a document's style part into a resolver.
 * @param stylesRoot - the `w:styles` root element, or undefined when the package has no style part.
 * @param theme - the document theme colours and typefaces.
 * @returns the resolver every paragraph, run, and table reads through.
 */
export function readStyles(stylesRoot: Element | undefined, theme: Theme): StyleResolver {
  if (stylesRoot === undefined) return NO_STYLES
  const docDefaults = child(stylesRoot, NS_W, 'docDefaults')
  const defaults: ResolvedStyle = {
    para: readParaFormat(child(child(docDefaults, NS_W, 'pPrDefault'), NS_W, 'pPr'), theme),
    run: readRunFormat(child(child(docDefaults, NS_W, 'rPrDefault'), NS_W, 'rPr'), theme),
    table: {},
  }
  const entries = new Map<string, StyleEntry>()
  const defaultIds = new Map<string, string>()
  for (const style of children(stylesRoot, NS_W, 'style')) {
    const id = wAttr(style, 'styleId')
    if (id === undefined) continue
    const type = wAttr(style, 'type') ?? 'paragraph'
    entries.set(`${type}:${id}`, {
      basedOn: wAttr(child(style, NS_W, 'basedOn'), 'val'),
      para: readParaFormat(child(style, NS_W, 'pPr'), theme),
      run: readRunFormat(child(style, NS_W, 'rPr'), theme),
      table: readTableFormat(child(style, NS_W, 'tblPr'), theme),
      bands: readBands(style, theme),
    })
    if (wFlag(style, 'default') === true) defaultIds.set(type, id)
  }

  const resolved = new Map<string, ResolvedStyle>()
  const resolvedCharacters = new Map<string, RunFormat>()
  const resolvedTables = new Map<string, ResolvedTable>()
  const resolve = (type: string, id: string | undefined, seen: Set<string>): ResolvedStyle => {
    if (id === undefined) return defaults
    const key = `${type}:${id}`
    const cached = resolved.get(key)
    if (cached !== undefined) return cached
    const entry = entries.get(key)
    if (entry === undefined || seen.has(key)) return defaults
    seen.add(key)
    const base = resolve(type, entry.basedOn, seen)
    const merged: ResolvedStyle = {
      para: mergePara(base.para, entry.para),
      run: mergeRun(base.run, entry.run),
      table: { ...base.table, ...entry.table },
    }
    resolved.set(key, merged)
    return merged
  }
  // Table styles resolve separately: a derived table style inherits the bands
  // its base style states and adds its own over them.
  const resolveTable = (id: string | undefined, seen: Set<string>): ResolvedTable => {
    if (id === undefined) return { table: {}, bands: {} }
    const key = `table:${id}`
    const cached = resolvedTables.get(key)
    if (cached !== undefined) return cached
    const entry = entries.get(key)
    if (entry === undefined || seen.has(key)) return { table: {}, bands: {} }
    seen.add(key)
    const base = resolveTable(entry.basedOn, seen)
    const merged: ResolvedTable = {
      table: { ...base.table, ...entry.table },
      bands: { ...base.bands, ...entry.bands },
    }
    resolvedTables.set(key, merged)
    return merged
  }
  // A character style resolves its own stated properties over its basedOn
  // chain only, never the document defaults: those already sit under the
  // paragraph cascade, and re-applying them above it would stomp every
  // paragraph-level value. A document's default character style is exactly
  // such an overlay, and it states nothing.
  const resolveCharacter = (id: string | undefined, seen: Set<string>): RunFormat => {
    if (id === undefined) return {}
    const key = `character:${id}`
    const cached = resolvedCharacters.get(key)
    if (cached !== undefined) return cached
    const entry = entries.get(key)
    if (entry === undefined || seen.has(key)) return {}
    seen.add(key)
    const merged = mergeRun(resolveCharacter(entry.basedOn, seen), entry.run)
    resolvedCharacters.set(key, merged)
    return merged
  }

  return {
    defaults,
    paragraph: (id: string | undefined): ResolvedStyle =>
      resolve('paragraph', id ?? defaultIds.get('paragraph'), new Set()),
    character: (id: string | undefined): RunFormat => {
      const chosen = id ?? defaultIds.get('character')
      return chosen === undefined ? {} : resolveCharacter(chosen, new Set())
    },
    table: (id: string | undefined): ResolvedTable => {
      const chosen = id ?? defaultIds.get('table')
      return chosen === undefined ? { table: {}, bands: {} } : resolveTable(chosen, new Set())
    },
  }
}
