/**
 * OOXML package → Word render model.
 *
 * A WordprocessingML package is a part graph: the package root names the main
 * document part, that part names its styles, numbering, settings, theme, media,
 * and per-section headers and footers, and each of those parts names its own
 * relatives. Parsing walks that graph once, resolves the styles cascade and the
 * numbering counters while the body is read in order, and hands back a document
 * whose sections already carry their page geometry and their blocks. Referenced
 * media parts become Blob URLs that the caller releases on unmount.
 */
import {
  attrNs, child, children, DEFAULT_THEME_FONTS, DEFAULT_THEME_SCHEME, isOle2Container, NS_R, parseXml,
  readPartRelationships, readTheme, REL_IMAGE, REL_OFFICE_DOCUMENT, REL_THEME, rootOf, roundPx, targetOf,
  twipsToPx, ZipFormatError, ZipPackage,
} from '@deepseek-ai/dsh-client-sdkwork-office'
import type { Relationship, Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import { applyContextualSpacing, readBlocks, readParagraphBlocks } from './content.ts'
import type { DocxLabels, DocxReadContext } from './content.ts'
import type {
  DocxBlock, DocxDocument, DocxHeaderFooter, DocxHeaderFooterSet, DocxPageGeometry, DocxSection,
} from './model.ts'
import { NS_W, REL_FOOTER, REL_HEADER, REL_NUMBERING, REL_SETTINGS, REL_STYLES, wAttr, wNum, wOnOff } from './names.ts'
import { readNumbering } from './numbering.ts'
import { readStyles } from './styles.ts'
import { readTable } from './table.ts'

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

/** US Letter in twips, the page size a section that states none uses. */
const DEFAULT_PAGE_WIDTH_TWIPS = 12240
/** US Letter's height in twips. */
const DEFAULT_PAGE_HEIGHT_TWIPS = 15840
/** One inch in twips, the margin a section that states none uses. */
const DEFAULT_MARGIN_TWIPS = 1440
/** Half an inch in twips, the header and footer distance a section that states none uses. */
const DEFAULT_HEADER_DISTANCE_TWIPS = 720

/** Part names Word uses when a package omits the relationship for them. */
const FALLBACK_PARTS: Readonly<Record<string, string>> = {
  [REL_STYLES]: 'word/styles.xml',
  [REL_NUMBERING]: 'word/numbering.xml',
  [REL_SETTINGS]: 'word/settings.xml',
  [REL_THEME]: 'word/theme/theme1.xml',
}



/** Why a package could not be rendered. */
export type DocxFailureCode =
  /** A Word 97–2003 binary document, which is not an OOXML package. */
  | 'legacy-binary'
  /** The bytes are not a ZIP container. */
  | 'not-a-package'
  /** The package is a ZIP but carries no readable main document part. */
  | 'no-document'

/** A parse failure the preview renders as a specific explanation. */
export class DocxParseError extends Error {
  constructor(readonly code: DocxFailureCode, message: string) {
    super(message)
    this.name = 'DocxParseError'
  }
}

/** A parsed document plus the resource release the preview must run on unmount. */
export interface ParsedDocx {
  readonly document: DocxDocument
  /** Revoke every Blob URL created for this document. */
  readonly dispose: () => void
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
    const data = await pkg.read(relationship.target)
    if (data === undefined) continue
    urls.set(relationship.target, URL.createObjectURL(new Blob([data.slice()], { type })))
  }
}

/**
 * Read an auxiliary part through its relationship, falling back to Word's part name.
 * @param pkg - the open package.
 * @param relationships - the main document part's relationships.
 * @param suffix - the required relationship type suffix.
 * @param fallback - package part name for the fallback lookup.
 * @returns the part's root element, or undefined when the package has no such part.
 */
async function readPartElement(
  pkg: ZipPackage,
  relationships: ReadonlyMap<string, Relationship>,
  suffix: string,
  fallback: string,
): Promise<Element | undefined> {
  const declared = [...relationships.values()]
    .find(relationship => !relationship.external && relationship.type.endsWith(suffix))?.target
  const target = declared ?? (pkg.has(fallback) ? fallback : undefined)
  if (target === undefined) return undefined
  const text = await pkg.readText(target)
  return text === undefined ? undefined : rootOf(parseXml(text, target))
}

/**
 * Read a section's page geometry.
 * @param sectPr - the `w:sectPr` element, or undefined for a document that states none.
 * @returns the page size, margins, and the body area they leave.
 */
function readGeometry(sectPr: Element | undefined): DocxPageGeometry {
  const size = child(sectPr, NS_W, 'pgSz')
  const widthPx = twipsToPx(wNum(size, 'w') ?? DEFAULT_PAGE_WIDTH_TWIPS)
  const heightPx = twipsToPx(wNum(size, 'h') ?? DEFAULT_PAGE_HEIGHT_TWIPS)
  const margin = child(sectPr, NS_W, 'pgMar')
  const top = twipsToPx(wNum(margin, 'top') ?? DEFAULT_MARGIN_TWIPS)
  const bottom = twipsToPx(wNum(margin, 'bottom') ?? DEFAULT_MARGIN_TWIPS)
  const left = twipsToPx(wNum(margin, 'left') ?? DEFAULT_MARGIN_TWIPS)
  const right = twipsToPx(wNum(margin, 'right') ?? DEFAULT_MARGIN_TWIPS)
  return {
    widthPx: roundPx(widthPx),
    heightPx: roundPx(heightPx),
    marginTopPx: roundPx(top),
    marginRightPx: roundPx(right),
    marginBottomPx: roundPx(bottom),
    marginLeftPx: roundPx(left),
    headerPx: roundPx(twipsToPx(wNum(margin, 'header') ?? DEFAULT_HEADER_DISTANCE_TWIPS)),
    footerPx: roundPx(twipsToPx(wNum(margin, 'footer') ?? DEFAULT_HEADER_DISTANCE_TWIPS)),
    contentWidthPx: roundPx(Math.max(0, widthPx - left - right)),
    contentHeightPx: roundPx(Math.max(0, heightPx - top - bottom)),
  }
}

/**
 * Read one header or footer part.
 * @param partName - the part's package-absolute name.
 * @param story - the document context the part resolves against.
 * @param pkg - the open package.
 * @param urls - accumulator from media part name to Blob URL.
 * @param numberingRoot - the numbering part, so the story starts its own counters.
 * @returns the parsed story, or undefined when the part is unreadable.
 */
async function readStory(
  partName: string,
  story: DocxReadContext,
  pkg: ZipPackage,
  urls: Map<string, string>,
  numberingRoot: Element | undefined,
): Promise<DocxHeaderFooter | undefined> {
  const text = await pkg.readText(partName)
  if (text === undefined) return undefined
  const relationships = await readPartRelationships(pkg, partName)
  await resolveImages(relationships, pkg, urls)
  return {
    blocks: readBlocks(rootOf(parseXml(text, partName)), {
      ...story,
      relationships,
      numbering: readNumbering(numberingRoot, story.theme),
    }),
  }
}

/**
 * Read a section's header or footer references.
 * @param sectPr - the section properties.
 * @param element - `headerReference` or `footerReference`.
 * @param suffix - the required relationship type suffix.
 * @param story - the document context the parts resolve against.
 * @param pkg - the open package.
 * @param urls - accumulator from media part name to Blob URL.
 * @param numberingRoot - the numbering part, so each story starts its own counters.
 * @returns the referenced stories, by the page kind they apply to.
 */
async function readStorySet(
  sectPr: Element | undefined,
  element: string,
  suffix: string,
  story: DocxReadContext,
  pkg: ZipPackage,
  urls: Map<string, string>,
  numberingRoot: Element | undefined,
): Promise<DocxHeaderFooterSet> {
  const set: { default?: DocxHeaderFooter; first?: DocxHeaderFooter; even?: DocxHeaderFooter } = {}
  for (const reference of children(sectPr, NS_W, element)) {
    const target = targetOf(story.relationships, attrNs(reference, NS_R, 'id'), suffix)
    if (target === undefined) continue
    const parsed = await readStory(target, story, pkg, urls, numberingRoot)
    if (parsed === undefined) continue
    const kind = wAttr(reference, 'type') ?? 'default'
    if (kind === 'first') set.first = parsed
    else if (kind === 'even') set.even = parsed
    else set.default = parsed
  }
  return set
}

/**
 * Build one section from the properties that end it.
 * @param sectPr - the `w:sectPr` element, or undefined for the trailing default section.
 * @param blocks - the body blocks the section holds.
 * @param story - the document context the parts resolve against.
 * @param pkg - the open package.
 * @param urls - accumulator from media part name to Blob URL.
 * @param numberingRoot - the numbering part for the section's stories.
 * @returns the complete section.
 */
async function buildSection(
  sectPr: Element | undefined,
  blocks: readonly DocxBlock[],
  story: DocxReadContext,
  pkg: ZipPackage,
  urls: Map<string, string>,
  numberingRoot: Element | undefined,
): Promise<DocxSection> {
  const start = wNum(child(sectPr, NS_W, 'pgNumType'), 'start')
  return {
    geometry: readGeometry(sectPr),
    titlePage: wOnOff(sectPr, 'titlePg') === true,
    ...(start === undefined ? {} : { pageNumberStart: Math.round(start) }),
    headers: await readStorySet(sectPr, 'headerReference', REL_HEADER, story, pkg, urls, numberingRoot),
    footers: await readStorySet(sectPr, 'footerReference', REL_FOOTER, story, pkg, urls, numberingRoot),
    blocks,
  }
}

/**
 * Whether a section break continues on the page instead of opening one.
 * @param sectPr - the `w:sectPr` element that states the break type.
 * @returns true for a continuous break, false for a page or section break the file leaves unstated.
 */
function isContinuous(sectPr: Element | undefined): boolean {
  return sectPr !== undefined && wAttr(child(sectPr, NS_W, 'type'), 'val') === 'continuous'
}

/**
 * Split a document body into its sections.
 *
 * A paragraph's `w:pPr/w:sectPr` ends a section after that paragraph, and the
 * body-level `w:sectPr` ends the last one; a body without either is a single
 * section with Word's default geometry. Blocks are read as one list first so
 * contextual spacing still sees every neighbour, then cut at the boundaries.
 * @param body - the `w:body` element.
 * @param story - the document context the parts resolve against.
 * @param pkg - the open package.
 * @param urls - accumulator from media part name to Blob URL.
 * @param numberingRoot - the numbering part for the sections' stories.
 * @returns the sections in document order.
 */
async function readSections(
  body: Element,
  story: DocxReadContext,
  pkg: ZipPackage,
  urls: Map<string, string>,
  numberingRoot: Element | undefined,
): Promise<readonly DocxSection[]> {
  const read: DocxBlock[] = []
  const cuts: { readonly index: number; readonly sectPr: Element | undefined }[] = []
  // Word templates park whole runs of content in `w:sdt` content controls,
  // which read as if bare; a section break inside one still ends a section.
  const walk = (container: Element): void => {
    for (const node of children(container, NS_W)) {
      if (node.localName === 'p') {
        read.push(...readParagraphBlocks(node, story))
        const sectPr = child(child(node, NS_W, 'pPr'), NS_W, 'sectPr')
        if (sectPr !== undefined) cuts.push({ index: read.length, sectPr })
      } else if (node.localName === 'tbl') {
        read.push(readTable(node, story))
      } else if (node.localName === 'sdt') {
        const content = child(node, NS_W, 'sdtContent')
        if (content !== undefined) walk(content)
      } else if (node.localName === 'sectPr') {
        cuts.push({ index: read.length, sectPr: node })
      }
    }
  }
  walk(body)
  const blocks = applyContextualSpacing(read)
  const trailing = cuts.at(-1)
  if (trailing === undefined || trailing.index < blocks.length) {
    cuts.push({ index: blocks.length, sectPr: undefined })
  }
  const sections: DocxSection[] = []
  // A continuous break shares its page with the section before it, so the
  // open group absorbs it until the next break that opens a page. A continuous
  // break that declares its own header or footer parts still opens a page, so
  // those parts land on the pages they belong to.
  let start = 0
  for (const cut of cuts) {
    if (isContinuous(cut.sectPr) && sections.length > 0 && !declaresStory(cut.sectPr)) continue
    sections.push(await buildSection(cut.sectPr, blocks.slice(start, cut.index), story, pkg, urls, numberingRoot))
    start = cut.index
  }
  return inheritStories(sections)
}

/**
 * Whether a sectPr declares header or footer parts of its own.
 * @param sectPr - the `w:sectPr` element, or undefined.
 * @returns true when at least one header or footer reference is present.
 */
function declaresStory(sectPr: Element | undefined): boolean {
  if (sectPr === undefined) return false
  return child(sectPr, NS_W, 'headerReference') !== undefined || child(sectPr, NS_W, 'footerReference') !== undefined
}

/**
 * Fill each section's missing header and footer parts from the section before
 * it, which is how OOXML sections inherit their stories.
 * @param sections - the sections in document order.
 * @returns the sections with inherited header and footer sets.
 */
function inheritStories(sections: readonly DocxSection[]): readonly DocxSection[] {
  let headers: DocxHeaderFooterSet = {}
  let footers: DocxHeaderFooterSet = {}
  return sections.map((section) => {
    const inherited = {
      ...section,
      headers: { ...headers, ...section.headers },
      footers: { ...footers, ...section.footers },
    }
    headers = inherited.headers
    footers = inherited.footers
    return inherited
  })
}

/**
 * Parse a .docx package into a render model.
 * @param bytes - the complete file.
 * @param labels - localized strings the parse itself needs.
 * @returns the document and the Blob URL release to run on unmount.
 * @throws {DocxParseError} when the file is not a renderable WordprocessingML document.
 */
export async function parseDocx(bytes: Uint8Array, labels: DocxLabels): Promise<ParsedDocx> {
  if (isOle2Container(bytes)) {
    throw new DocxParseError('legacy-binary', 'Word 97-2003 binary document')
  }
  let pkg: ZipPackage
  try {
    pkg = ZipPackage.open(bytes)
  } catch (error) {
    if (error instanceof ZipFormatError) throw new DocxParseError('not-a-package', error.message)
    throw error
  }

  const urls = new Map<string, string>()
  const mediaUrl = (partName: string): string | undefined => urls.get(partName)
  const dispose = (): void => {
    for (const url of urls.values()) URL.revokeObjectURL(url)
    urls.clear()
  }

  // The package root part is the one that declares `_rels/.rels`; its targets
  // are package-absolute.
  const packageRels = await readPartRelationships(pkg, '')
  const documentPart = [...packageRels.values()]
    .find(relationship => relationship.type.endsWith(REL_OFFICE_DOCUMENT))?.target
  const documentText = documentPart === undefined ? undefined : await pkg.readText(documentPart)
  if (documentPart === undefined || documentText === undefined) {
    throw new DocxParseError('no-document', 'package names no readable main document part')
  }
  const root = rootOf(parseXml(documentText, documentPart))
  const relationships = await readPartRelationships(pkg, documentPart)
  await resolveImages(relationships, pkg, urls)

  const themeElement = await readPartElement(pkg, relationships, REL_THEME, FALLBACK_PARTS[REL_THEME])
  const theme: Theme = themeElement === undefined
    ? { scheme: DEFAULT_THEME_SCHEME, fonts: DEFAULT_THEME_FONTS }
    : readTheme(themeElement)
  const stylesRoot = await readPartElement(pkg, relationships, REL_STYLES, FALLBACK_PARTS[REL_STYLES])
  const numberingRoot = await readPartElement(pkg, relationships, REL_NUMBERING, FALLBACK_PARTS[REL_NUMBERING])
  const settingsRoot = await readPartElement(pkg, relationships, REL_SETTINGS, FALLBACK_PARTS[REL_SETTINGS])

  const story: DocxReadContext = {
    theme,
    styles: readStyles(stylesRoot, theme),
    numbering: readNumbering(numberingRoot, theme),
    relationships,
    mediaUrl,
    labels,
    readBlocks,
  }
  const body = child(root, NS_W, 'body')
  if (body === undefined) throw new DocxParseError('no-document', 'document part has no body')
  const sections = await readSections(body, story, pkg, urls, numberingRoot)
  return {
    document: { sections, evenAndOddHeaders: wOnOff(settingsRoot, 'evenAndOddHeaders') === true },
    dispose,
  }
}
