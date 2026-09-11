/**
 * OOXML package → render model.
 *
 * A presentation is a graph: the presentation part lists slides and masters,
 * each slide names a layout, the layout names a master, and each master names
 * its own theme. Appearance is inherited along that chain, so parsing resolves
 * every layout through the master it declares — commercial decks routinely
 * carry several masters — and hands the shape reader a fully resolved context.
 * Non-placeholder shapes on the master and layout beneath a slide are painted
 * ahead of the slide's own shapes, because that is where Office paints them.
 * Referenced media parts become Blob URLs that the caller releases when the
 * preview unmounts, and a parse that fails after media resolution releases
 * them itself.
 */
import {
  attr, attrNs, boolAttr, child, children, DEFAULT_THEME_FONTS, DEFAULT_THEME_SCHEME, emuToPx, NS_A, NS_P, NS_R,
  isOle2Container, parseXml, readPartRelationships, readTheme, REL_IMAGE, REL_THEME, rootOf, roundPx,
  targetOf,
  ZipFormatError, ZipPackage,
} from '@deepseek-ai/dsh-client-sdkwork-office'
import type { ColorContext, Relationship, Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import { readColorMap, withColorMap } from './color-map.ts'
import { REL_NOTES_SLIDE, REL_SLIDE, REL_SLIDE_LAYOUT, REL_SLIDE_MASTER, REL_TABLE_STYLES } from './relationships.ts'
import type { TextStyle, TextStyleSet } from './text.ts'
import { EMPTY_TEXT_STYLE, readDefaultTextStyle, readMasterTextStyles } from './text.ts'
import type { ShapeContext, ShapeLabels, TableStyleElements } from './shapes.ts'
import { externalHrefOf, IDENTITY_TRANSFORM, readBackground, readShapes } from './shapes.ts'
import type { PptxDeck, PptxFill, PptxShape, PptxSlide } from './model.ts'

/** Office's default 16:9 slide size in EMU, used when the presentation states none. */
const DEFAULT_SLIDE_WIDTH_EMU = 12192000
/** Office's default 16:9 slide height in EMU. */
const DEFAULT_SLIDE_HEIGHT_EMU = 6858000

/** Media part suffixes the browser can decode directly. */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}

/** Why a package could not be rendered. */
export type PptxFailureCode =
  /** A PowerPoint 97–2003 binary deck, which is not an OOXML package. */
  | 'legacy-binary'
  /** The bytes are not a ZIP container. */
  | 'not-a-package'
  /** The package is a ZIP but carries no presentation part. */
  | 'no-presentation'

/** A parse failure the preview renders as a specific explanation. */
export class PptxParseError extends Error {
  constructor(readonly code: PptxFailureCode, message: string) {
    super(message)
    this.name = 'PptxParseError'
  }
}

/** Localized strings parsing needs before any component renders. */
export interface PptxLabels {
  /**
   * Slide display name for a 1-based index.
   * @param index - slide position.
   * @returns the visible name.
   */
  readonly slideName: (index: number) => string
  /**
   * Description shown in place of a chart, SmartArt, or media frame.
   * @returns the visible description.
   */
  readonly unsupportedFrame: () => string
  /**
   * Description shown in place of a picture the browser cannot decode.
   * @returns the visible description.
   */
  readonly missingImage: () => string
}

/** A parsed deck plus the resource release the preview must run on unmount. */
export interface ParsedPptx {
  readonly deck: PptxDeck
  /** Revoke every Blob URL created for this deck. */
  readonly dispose: () => void
}

/** A placeholder's inherited geometry and list style, keyed as slides reference them. */
interface PlaceholderEntry {
  /** The placeholder's `p:spPr`, which carries geometry when the slide omits it. */
  readonly geometry: Element | undefined
  /** The placeholder's `p:txBody`, whose `a:lstStyle` the slide inherits. */
  readonly body: Element | undefined
}

/**
 * Index a layout's or master's placeholders.
 * @param tree - the part's `p:spTree`.
 * @returns placeholder entries keyed by `idx:` or `type:` reference.
 */
function indexPlaceholders(tree: Element | undefined): ReadonlyMap<string, PlaceholderEntry> {
  const entries = new Map<string, PlaceholderEntry>()
  for (const node of children(tree, NS_P, 'sp')) {
    const nvPr = child(child(node, NS_P, 'nvSpPr'), NS_P, 'nvPr')
    const placeholder = child(nvPr, NS_P, 'ph')
    if (placeholder === undefined) continue
    const entry: PlaceholderEntry = {
      geometry: child(node, NS_P, 'spPr'),
      body: child(node, NS_P, 'txBody'),
    }
    const index = attr(placeholder, 'idx')
    const type = attr(placeholder, 'type')
    if (index !== undefined) entries.set(`idx:${index}`, entry)
    if (type !== undefined) entries.set(`type:${type}`, entry)
    if (index === undefined && type === undefined) entries.set('type:body', entry)
  }
  return entries
}

/** Header/footer placeholder enablement, as a part's `p:hf` declares it. */
type HfFlags = Partial<Record<'ftr' | 'dt' | 'sldNum', boolean>>

/** The placeholder types `p:hf` gates. */
const HF_TYPES = new Set(['ftr', 'dt', 'sldNum'])

/**
 * The gated placeholder types a part draws, given its flags (or a chain
 * resolver). A type draws only when the flags state `true`.
 * @param hf - declared flags, or a resolver from type to flag.
 * @returns the enabled placeholder types.
 */
function enabledHfTypes(hf: HfFlags | ((type: string) => boolean | undefined)): Set<string> {
  const enabled = new Set<string>()
  for (const type of HF_TYPES) {
    const declared = typeof hf === 'function' ? hf(type) : hf[type as 'ftr' | 'dt' | 'sldNum']
    if (declared === true) enabled.add(type)
  }
  return enabled
}

/**
 * Read a part's header/footer enablement. An omitted `p:hf` element disables
 * every gated placeholder; a present element leaves an omitted attribute at
 * the OOXML default, which is enabled.
 * @param root - the part's root element.
 * @returns the declared flags, absent meaning disabled.
 */
function readHf(root: Element): HfFlags {
  const hf = child(root, NS_P, 'hf')
  if (hf === undefined) return {}
  const flags: HfFlags = {}
  for (const type of HF_TYPES) {
    const value = attr(hf, type)
    if (value !== undefined) flags[type as 'ftr' | 'dt' | 'sldNum'] = value === '1' || value === 'true'
  }
  return flags
}

/** Everything a slide inherits from its layout and master. */
interface InheritedPart {
  readonly root: Element
  /** The part's `p:spTree`, folded per slide so slide-number fields stay live. */
  readonly tree: Element | undefined
  readonly relationships: ReadonlyMap<string, Relationship>
  readonly placeholders: ReadonlyMap<string, PlaceholderEntry>
  readonly colorContext: ColorContext
  readonly background: PptxFill | undefined
  readonly hf: HfFlags
}

/** A slide master with the theme and text styles its layouts inherit. */
interface MasterPart {
  readonly colorContext: ColorContext
  readonly theme: Theme
  readonly styles: Pick<TextStyleSet, 'title' | 'body' | 'other'>
  readonly background: PptxFill | undefined
  readonly placeholders: ReadonlyMap<string, PlaceholderEntry>
  readonly relationships: ReadonlyMap<string, Relationship>
  readonly tree: Element | undefined
  readonly hf: HfFlags
}

/** A layout plus the master it declares, resolved once per layout part. */
interface LayoutEntry {
  readonly part: InheritedPart
  readonly master: MasterPart
}

/** The text styles a part that is not a master contributes. */
const NO_MASTER_STYLES: Pick<TextStyleSet, 'title' | 'body' | 'other'> = {
  title: EMPTY_TEXT_STYLE,
  body: EMPTY_TEXT_STYLE,
  other: EMPTY_TEXT_STYLE,
}

/** The theme a package without a readable theme part falls back to. */
const FALLBACK_THEME: Theme = { scheme: DEFAULT_THEME_SCHEME, fonts: DEFAULT_THEME_FONTS }

/**
 * Resolve a hyperlink relationship for a slide: an internal slide jump
 * (marked by the `hlinksldjump` action) becomes a `#slide/N` marker the body
 * navigates to, an external web or mail target passes the scheme whitelist,
 * and everything else stays plain text.
 * @param slideRels - the slide's relationships.
 * @param slideIndexByPart - slide part names mapped to 1-based positions.
 * @param id - the `r:id` of `a:hlinkClick`.
 * @returns the link target, or undefined.
 */
function slideLinkTarget(
  slideRels: ReadonlyMap<string, Relationship>,
  slideIndexByPart: ReadonlyMap<string, number>,
  id: string | undefined,
): string | undefined {
  const relationship = id === undefined ? undefined : slideRels.get(id)
  if (relationship === undefined || relationship.external) return externalHrefOf(slideRels, id)
  const index = slideIndexByPart.get(relationship.target)
  return index === undefined ? undefined : `#slide/${index}`
}

/**
 * Yield to the event loop so a large deck cannot hold the main thread across
 * the whole parse.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0) })
}

/**
 * Create Blob URLs for every image a part's relationships reference.
 * @param relationships - the part's relationships.
 * @param pkg - the open package.
 * @param urls - accumulator from media part name to Blob URL.
 */
async function resolveImages(
  relationships: ReadonlyMap<string, Relationship>,
  pkg: ZipPackage,
  urls: Map<string, string>,
): Promise<void> {
  for (const relationship of relationships.values()) {
    if (relationship.external || !relationship.type.endsWith(REL_IMAGE)) continue
    if (urls.has(relationship.target)) continue
    const type = mediaTypeOf(relationship.target)
    if (type === undefined) continue
    // Media converts to a Blob URL and is never read again, so the bytes are
    // evicted from the package cache right away.
    const data = await pkg.read(relationship.target, { evict: true })
    if (data === undefined) continue
    // The slice detaches the bytes from the package buffer's view type so the
    // Blob owns a plain ArrayBuffer.
    urls.set(relationship.target, URL.createObjectURL(new Blob([data.slice()], { type })))
  }
}

/**
 * The MIME type for a media part, by extension.
 * @param partName - package-absolute media part name.
 * @returns the MIME type, or undefined when the browser cannot decode the format.
 */
function mediaTypeOf(partName: string): string | undefined {
  const name = partName.slice(partName.lastIndexOf('/') + 1).toLowerCase()
  return MEDIA_TYPES[name.slice(name.lastIndexOf('.') + 1)]
}

/**
 * Read the speaker notes attached to a slide.
 *
 * A malformed or unreadable notes part costs the notes text, not the slide:
 * Office tolerates a broken notes attachment and so does the preview.
 * @param slideRels - the slide's relationships.
 * @param pkg - the open package.
 * @returns one string per non-empty notes paragraph.
 */
async function readNotes(
  slideRels: ReadonlyMap<string, Relationship>,
  pkg: ZipPackage,
): Promise<readonly string[]> {
  const notesPart = [...slideRels.values()]
    .find(relationship => !relationship.external && relationship.type.endsWith(REL_NOTES_SLIDE))
  if (notesPart === undefined) return []
  try {
    const text = await pkg.readText(notesPart.target)
    if (text === undefined) return []
    const root = rootOf(parseXml(text, notesPart.target))
    const tree = child(child(root, NS_P, 'cSld'), NS_P, 'spTree')
    for (const shape of children(tree, NS_P, 'sp')) {
      const nvPr = child(child(shape, NS_P, 'nvSpPr'), NS_P, 'nvPr')
      if (attr(child(nvPr, NS_P, 'ph'), 'type') !== 'body') continue
      return children(child(shape, NS_P, 'txBody'), NS_A, 'p')
        .map(paragraph => children(paragraph, NS_A, 'r')
          .map(run => child(run, NS_A, 't')?.textContent ?? '')
          .join(''))
        .filter(line => line.trim() !== '')
    }
    return []
  } catch {
    // The notes part is auxiliary: a malformed attachment renders as no notes.
    return []
  }
}

/** Shared parsing inputs for one inherited part's shape tree. */
interface PartInputs {
  readonly pkg: ZipPackage
  readonly mediaUrl: (name: string) => string | undefined
  readonly labels: ShapeLabels
  defaultStyle: TextStyle
}

/**
 * Read one master part's theme, colour map, styles, and placeholders.
 * @param partName - the master's package-absolute name.
 * @param pkg - the open package.
 * @param mediaUrl - media resolver, for the master's background picture.
 * @returns the master core, or undefined when the part is missing.
 */
async function readMasterCore(
  partName: string,
  pkg: ZipPackage,
  mediaUrl: (name: string) => string | undefined,
): Promise<MasterPart | undefined> {
  const text = await pkg.readText(partName)
  if (text === undefined) return undefined
  const root = rootOf(parseXml(text, partName))
  const relationships = await readPartRelationships(pkg, partName)
  const themePart = [...relationships.values()]
    .find(relationship => !relationship.external && relationship.type.endsWith(REL_THEME))?.target
  const themeText = themePart === undefined ? undefined : await pkg.readText(themePart)
  const theme: Theme = themeText === undefined || themePart === undefined
    ? FALLBACK_THEME
    : readTheme(rootOf(parseXml(themeText, themePart)))
  const colorContext: ColorContext = { scheme: theme.scheme, colorMap: readColorMap(root) }
  const container = child(root, NS_P, 'cSld')
  const tree = child(container, NS_P, 'spTree')
  return {
    colorContext,
    theme,
    styles: readMasterTextStyles(root, colorContext, theme.fonts),
    background: readBackground(container, colorContext, mediaUrl, relationships),
    placeholders: indexPlaceholders(tree),
    relationships,
    tree,
    hf: readHf(root),
  }
}

/**
 * Read one layout part against the master it declares.
 * @param partName - the layout's package-absolute name.
 * @param master - the master the layout names.
 * @param inputs - package, media resolver, labels, and presentation defaults.
 * @returns the layout, or undefined when the part is missing.
 */
async function readLayoutPart(
  partName: string,
  master: MasterPart,
  inputs: PartInputs,
): Promise<InheritedPart | undefined> {
  const text = await inputs.pkg.readText(partName)
  if (text === undefined) return undefined
  const root = rootOf(parseXml(text, partName))
  const relationships = await readPartRelationships(inputs.pkg, partName)
  const overrideMapping = child(child(root, NS_P, 'clrMapOvr'), NS_A, 'overrideClrMapping')
  const colorContext = overrideMapping === undefined
    ? master.colorContext
    : { scheme: master.theme.scheme, colorMap: readColorMap(overrideMapping) }
  const container = child(root, NS_P, 'cSld')
  const tree = child(container, NS_P, 'spTree')
  return {
    root,
    tree,
    relationships,
    placeholders: indexPlaceholders(tree),
    colorContext,
    background: readBackground(container, colorContext, inputs.mediaUrl, relationships),
    hf: readHf(root),
  }
}

/**
 * Parse a .pptx package into a render model.
 * @param bytes - the complete file.
 * @param labels - localized strings the parse itself needs.
 * @returns the deck and the Blob URL release to run on unmount.
 * @throws {PptxParseError} when the file is not a renderable OOXML presentation.
 */
export async function parsePptx(bytes: Uint8Array, labels: PptxLabels): Promise<ParsedPptx> {
  if (isOle2Container(bytes)) {
    throw new PptxParseError('legacy-binary', 'PowerPoint 97-2003 binary presentation')
  }
  let pkg: ZipPackage
  try {
    pkg = ZipPackage.open(bytes)
  } catch (error) {
    if (error instanceof ZipFormatError) throw new PptxParseError('not-a-package', error.message)
    throw error
  }

  const urls = new Map<string, string>()
  const mediaUrl = (partName: string): string | undefined => urls.get(partName)
  const dispose = (): void => {
    for (const url of urls.values()) URL.revokeObjectURL(url)
    urls.clear()
  }
  const shapeLabels: ShapeLabels = {
    unsupportedFrame: labels.unsupportedFrame(),
    missingImage: labels.missingImage(),
  }

  // The package root is the part that declares `_rels/.rels`; its targets are
  // package-absolute. From here on, a failure must release the media Blob URLs
  // the walk has already created.
  try {
    const packageRels = await readPartRelationships(pkg, '')
    const presentationPart = [...packageRels.values()]
      .find(relationship => relationship.type.endsWith('/officeDocument'))?.target
    const presentationText = presentationPart === undefined
      ? undefined
      : await pkg.readText(presentationPart)
    if (presentationPart === undefined || presentationText === undefined) {
      throw new PptxParseError('no-presentation', 'package names no readable presentation part')
    }
    const presentation = rootOf(parseXml(presentationText, presentationPart))
    const presentationRels = await readPartRelationships(pkg, presentationPart)

    // Table styles carry their colours as raw scheme references, held as
    // elements and resolved per slide against that slide's own context.
    const tableStyles = new Map<string, TableStyleElements>()
    const tableStylesPart = [...presentationRels.values()]
      .find(relationship => !relationship.external && relationship.type.endsWith(REL_TABLE_STYLES))?.target
    const tableStylesText = tableStylesPart === undefined ? undefined : await pkg.readText(tableStylesPart)
    if (tableStylesText !== undefined) {
      for (const style of children(rootOf(parseXml(tableStylesText, tableStylesPart ?? '')), NS_A, 'tblStyle')) {
        const styleId = attr(style, 'styleId')
        if (styleId === undefined) continue
        tableStyles.set(styleId, {
          firstRow: child(style, NS_A, 'firstRow'),
          lastRow: child(style, NS_A, 'lastRow'),
          firstCol: child(style, NS_A, 'firstCol'),
          lastCol: child(style, NS_A, 'lastCol'),
          band1H: child(style, NS_A, 'band1H'),
          band2H: child(style, NS_A, 'band2H'),
          band1V: child(style, NS_A, 'band1V'),
          band2V: child(style, NS_A, 'band2V'),
          wholeTbl: child(style, NS_A, 'wholeTbl'),
        })
      }
    }

    const slideSize = child(presentation, NS_P, 'sldSz')
    const width = emuToPx(Number(attr(slideSize, 'cx') ?? DEFAULT_SLIDE_WIDTH_EMU))
    const height = emuToPx(Number(attr(slideSize, 'cy') ?? DEFAULT_SLIDE_HEIGHT_EMU))

    const inputs: PartInputs = { pkg, mediaUrl, labels: shapeLabels, defaultStyle: EMPTY_TEXT_STYLE }
    const masterIds = children(child(presentation, NS_P, 'sldMasterIdLst'), NS_P, 'sldMasterId')
    const masters = new Map<string, MasterPart>()
    let fallback: MasterPart | undefined
    // The first master's theme is what the presentation's default text style
    // resolves against, so it is read before the style is computed.
    for (const masterId of masterIds) {
      const masterPartName = targetOf(presentationRels, attrNs(masterId, NS_R, 'id'), REL_SLIDE_MASTER)
      if (masterPartName === undefined || masters.has(masterPartName)) continue
      const master = await readMasterCore(masterPartName, pkg, mediaUrl)
      if (master === undefined) continue
      masters.set(masterPartName, master)
      fallback ??= master
      await resolveImages(master.relationships, pkg, urls)
    }
    const baseTheme = fallback?.theme ?? FALLBACK_THEME
    inputs.defaultStyle = readDefaultTextStyle(
      presentation,
      withColorMap(baseTheme, readColorMap(undefined)),
      baseTheme.fonts,
    )

    const layouts = new Map<string, LayoutEntry | undefined>()

    /**
     * Read one layout with the master its own relationships declare, caching
     * by part name. A layout that names no readable master falls back to the
     * first presentation master, matching how Office keeps a broken deck
     * presentable.
     * @param layoutPart - the layout's package-absolute name.
     * @returns the layout and its master, or undefined when unreadable.
     */
    const readLayout = async (layoutPart: string): Promise<LayoutEntry | undefined> => {
      if (layouts.has(layoutPart)) return layouts.get(layoutPart)
      const layoutRels = await readPartRelationships(pkg, layoutPart)
      const masterPartName = [...layoutRels.values()]
        .find(relationship => !relationship.external && relationship.type.endsWith(REL_SLIDE_MASTER))?.target
      let master = masterPartName === undefined ? undefined : masters.get(masterPartName)
      if (master === undefined && masterPartName !== undefined) {
        const read = await readMasterCore(masterPartName, pkg, mediaUrl)
        if (read !== undefined) {
          await resolveImages(read.relationships, pkg, urls)
          master = read
          masters.set(masterPartName, master)
        }
      }
      master ??= fallback
      await resolveImages(layoutRels, pkg, urls)
      const part = master === undefined ? undefined : await readLayoutPart(layoutPart, master, inputs)
      const entry = part === undefined || master === undefined ? undefined : { part, master }
      layouts.set(layoutPart, entry)
      return entry
    }

    const slides: PptxSlide[] = []
    // Slide part names index ahead of the walk so an internal jump on slide 1
    // can resolve its forward target on slide 3.
    const slideIndexByPart = new Map<string, number>()
    for (const slideId of children(child(presentation, NS_P, 'sldIdLst'), NS_P, 'sldId')) {
      const slidePart = targetOf(presentationRels, attrNs(slideId, NS_R, 'id'), REL_SLIDE)
      if (slidePart !== undefined) slideIndexByPart.set(slidePart, slideIndexByPart.size + 1)
    }
    for (const [position, slideId] of children(child(presentation, NS_P, 'sldIdLst'), NS_P, 'sldId').entries()) {
      const slidePart = targetOf(presentationRels, attrNs(slideId, NS_R, 'id'), REL_SLIDE)
      if (slidePart === undefined) continue
      const slideText = await pkg.readText(slidePart)
      if (slideText === undefined) continue
      const slideRoot = rootOf(parseXml(slideText, slidePart))
      const slideRels = await readPartRelationships(pkg, slidePart)
      await resolveImages(slideRels, pkg, urls)

      const layoutPart = [...slideRels.values()]
        .find(relationship => !relationship.external && relationship.type.endsWith(REL_SLIDE_LAYOUT))?.target
      const layout = layoutPart === undefined ? undefined : await readLayout(layoutPart)
      const master = layout?.master ?? fallback

      const colorContext = layout?.part.colorContext ?? master?.colorContext ?? withColorMap(baseTheme, readColorMap(undefined))
      const fonts = master?.theme.fonts ?? baseTheme.fonts
      const geometryOf = (map: ReadonlyMap<string, PlaceholderEntry> | undefined) =>
        (key: string): Element | undefined => map?.get(key)?.geometry
      const styleOf = (map: ReadonlyMap<string, PlaceholderEntry> | undefined) =>
        (key: string): Element | undefined => map?.get(key)?.body
      const context: ShapeContext = {
        color: colorContext,
        fonts,
        masterStyles: master?.styles ?? NO_MASTER_STYLES,
        defaultStyle: inputs.defaultStyle,
        mediaUrl,
        relationships: slideRels,
        placeholderGeometry: (key: string) =>
          geometryOf(layout?.part.placeholders)(key) ?? geometryOf(master?.placeholders)(key),
        placeholderStyle: (key: string) =>
          styleOf(layout?.part.placeholders)(key) ?? styleOf(master?.placeholders)(key),
        fieldText: (type, _cached) => type === 'slidenum' ? String(position + 1) : undefined,
        linkTarget: id => slideLinkTarget(slideRels, slideIndexByPart, id),
        tableStyles,
      }
      const container = child(slideRoot, NS_P, 'cSld')
      const background = readBackground(container, colorContext, mediaUrl, slideRels)
        ?? layout?.part.background ?? master?.background
      // Office paints master shapes, then layout shapes, then the slide's own;
      // a slide or a layout can suppress the master layer with showMasterSp="0".
      // The decoration trees fold per slide so slidenum fields carry the real
      // position, and `p:hf` gates the footer/date/number placeholders.
      const showMaster = boolAttr(slideRoot, 'showMasterSp') ?? true
      const layoutShowMaster = layout === undefined ? true : boolAttr(layout.part.root, 'showMasterSp') ?? true
      const decorations: PptxShape[] = []
      if (master !== undefined && showMaster && layoutShowMaster) {
        const covered = new Set<string>()
        for (const key of layout?.part.placeholders.keys() ?? []) {
          if (!key.startsWith('type:')) continue
          const type = key.slice(5)
          if (HF_TYPES.has(type)) covered.add(type)
        }
        decorations.push(...readShapes(master.tree, {
          color: master.colorContext,
          fonts: master.theme.fonts,
          masterStyles: NO_MASTER_STYLES,
          defaultStyle: inputs.defaultStyle,
          mediaUrl,
          relationships: master.relationships,
          placeholderGeometry: () => undefined,
          placeholderStyle: () => undefined,
          fieldText: context.fieldText,
          linkTarget: id => externalHrefOf(master.relationships, id),
        }, IDENTITY_TRANSFORM, shapeLabels, {
          skipPlaceholders: true,
          hfPlaceholderTypes: enabledHfTypes(master.hf),
          suppressedHfTypes: covered,
        }))
      }
      if (layout !== undefined) {
        decorations.push(...readShapes(layout.part.tree, {
          color: layout.part.colorContext,
          fonts: master?.theme.fonts ?? baseTheme.fonts,
          masterStyles: master?.styles ?? NO_MASTER_STYLES,
          defaultStyle: inputs.defaultStyle,
          mediaUrl,
          relationships: layout.part.relationships,
          placeholderGeometry: key => master?.placeholders.get(key)?.geometry,
          placeholderStyle: key => master?.placeholders.get(key)?.body,
          fieldText: context.fieldText,
          linkTarget: id => externalHrefOf(layout.part.relationships, id),
        }, IDENTITY_TRANSFORM, shapeLabels, {
          skipPlaceholders: true,
          hfPlaceholderTypes: enabledHfTypes(type =>
            layout.part.hf[type as 'ftr' | 'dt' | 'sldNum'] ?? master?.hf[type as 'ftr' | 'dt' | 'sldNum'],
          ),
        }))
      }
      slides.push({
        index: position + 1,
        name: attr(container, 'name')?.trim() || labels.slideName(position + 1),
        partName: slidePart,
        ...(boolAttr(slideRoot, 'show') === false ? { hidden: true } : {}),
        ...(background === undefined ? {} : { background }),
        shapes: [
          ...decorations,
          ...readShapes(child(container, NS_P, 'spTree'), context, IDENTITY_TRANSFORM, shapeLabels),
        ],
        notes: await readNotes(slideRels, pkg),
      })
      // Hand the main thread back between slides so a large deck keeps the
      // progress spinner animating.
      await yieldToBrowser()
    }

    if (slides.length === 0) {
      throw new PptxParseError('no-presentation', 'presentation contains no slides')
    }
    return { deck: { width: roundPx(width), height: roundPx(height), slides }, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}
