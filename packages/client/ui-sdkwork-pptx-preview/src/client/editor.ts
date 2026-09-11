/**
 * Text editing: in-session application to the render model, and packaging
 * back into the original container on save.
 *
 * Edits are stored as plain text lines per shape, keyed by the slide part the
 * shape lives on. Applying them to the model replaces each edited paragraph's
 * runs with a single run carrying the line, so the paragraph's own formatting
 * (from its first run) survives while arbitrary per-character runs collapse —
 * the same trade every lightweight editor makes. Saving rewrites only the
 * touched XML parts inside the original container.
 */
import { readPartRelationships, ZipPackage } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { Relationship } from '@deepseek-ai/dsh-client-sdkwork-office'
import { REL_NOTES_SLIDE } from './pptx/relationships.ts'
import { rewriteZip } from './pptx/writer.ts'
import type { PptxShape, PptxSlide, PptxTextBody } from './pptx/model.ts'

/** The key one shape's edit is stored under. */
export function textEditKey(partName: string | undefined, shapeId: string): string {
  return `${partName ?? ''}#${shapeId}`
}

/** A default run for a line whose paragraph states no runs. */
function defaultRun(text: string): PptxTextBody['paragraphs'][number]['runs'][number] {
  return {
    text,
    lineBreak: false,
    sizePx: 24,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: '#000000',
    fontFamily: 'sans-serif',
    baseline: 0,
    letterSpacing: 0,
  }
}

/**
 * Replace a shape's text with the edited lines, keeping each paragraph's own
 * first-run formatting. Returns the shape unchanged when it has no text body.
 * @param shape - the shape to retext.
 * @param lines - one line per paragraph.
 * @returns the updated shape.
 */
function retextShape(shape: PptxShape, lines: readonly string[]): PptxShape {
  if (shape.kind !== 'shape' || shape.text === undefined) return shape
  const original = shape.text.paragraphs
  const template = original[0]
  const retexted: PptxTextBody = {
    ...shape.text,
    paragraphs: lines.map((line, index) => {
      const source = original[Math.min(index, original.length - 1)] ?? template
      const runs = source.runs.length > 0
        ? [{ ...source.runs[0], text: line }]
        : [defaultRun(line)]
      return { ...source, runs }
    }),
  }
  return { ...shape, text: retexted }
}

/**
 * Apply saved text edits to a slide, mapping shapes by id (including shapes
 * nested in groups).
 * @param slide - the parsed slide.
 * @param edits - text edits keyed by {@link textEditKey}.
 * @returns the slide with edited text, or the slide untouched when no edit
 * matches.
 */
export function applyTextEdits(
  slide: PptxSlide,
  edits: ReadonlyMap<string, readonly string[]>,
): PptxSlide {
  if (edits.size === 0) return slide
  let changedCount = 0
  const walk = (shape: PptxShape): PptxShape => {
    const lines = shape.id === '' ? undefined : edits.get(textEditKey(slide.partName, shape.id))
    if (shape.kind === 'group') {
      const children = shape.children.map(walk)
      const moved = children.some((childItem, index) => childItem !== shape.children[index])
      if (moved) changedCount += 1
      return moved ? { ...shape, children } : shape
    }
    if (lines === undefined) return shape
    changedCount += 1
    return retextShape(shape, lines)
  }
  const shapes = slide.shapes.map(walk)
  return changedCount > 0 ? { ...slide, shapes } : slide
}

/** The part name of a slide's notes slide, when the slide has one. */
async function notesPartOf(pkg: ZipPackage, slidePart: string): Promise<string | undefined> {
  const rels = await readPartRelationships(pkg, slidePart)
  const rel: Relationship | undefined = [...rels.values()]
    .find(relationship => !relationship.external && relationship.type.endsWith(REL_NOTES_SLIDE))
  return rel?.target
}

/** XML-escape text for direct string-built parts. */
function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

/** Paragraph XML for one notes line. */
function notesParagraph(line: string): string {
  return `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
}

/**
 * Patch an existing notes part's body placeholder with the edited text.
 * @param text - the notes part's XML text.
 * @param lines - one line per paragraph.
 * @returns the patched XML text.
 */
function patchNotesPart(text: string, lines: readonly string[]): string {
  const paragraphs = (lines.length === 0 ? [''] : lines)
    .map(line => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`)
    .join('')
  // Replace the text runs of the body placeholder: everything between the
  // body placeholder's first <a:p> and its closing </p:txBody>.
  const marker = '<p:ph type="body"'
  const markerIndex = text.indexOf(marker)
  if (markerIndex === -1) return text
  const txBody = text.indexOf('<p:txBody', markerIndex)
  if (txBody === -1) return text
  const firstParagraph = text.indexOf('<a:p>', txBody)
  const txBodyClose = text.indexOf('</p:txBody>', txBody)
  if (firstParagraph === -1 || txBodyClose === -1) return text
  return `${text.slice(0, firstParagraph)}${paragraphs}${text.slice(txBodyClose)}`
}

/**
 * Build a minimal notes part for a slide that never had one. The package
 * must carry a notes master; PowerPoint's own decks always do.
 * @param pkg - the open original package.
 * @param replacements - accumulator the new parts are written into.
 * @param slidePart - the slide part the notes belong to.
 * @param lines - one line per paragraph.
 */
async function createNotesPart(
  pkg: ZipPackage,
  replacements: Map<string, string>,
  slidePart: string,
  lines: readonly string[],
): Promise<void> {
  const names = pkg.names()
  const master = names.find(name => /^ppt\/notesMasters\/notesMaster\d+\.xml$/u.test(name))
  if (master === undefined) return
  const used = [...names].map(name => /\/notesSlide(\d+)\.xml$/u.exec(name)?.[1])
  const next = Math.max(0, ...used.map(value => Number(value ?? 0))) + 1
  const partName = `ppt/notesSlides/notesSlide${next}.xml`
  const paragraphs = lines.map(line => notesParagraph(line)).join('') || notesParagraph('')
  replacements.set(partName, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`)
  replacements.set(`ppt/notesSlides/_rels/notesSlide${next}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/></Relationships>`)
  const relsPart = `ppt/slides/_rels/${slidePart.slice('ppt/slides/'.length)}.rels`
  const relsText = (await pkg.readText(relsPart)) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  const nextId = 1 + [...relsText.matchAll(/Id="rId(\d+)"/gu)].reduce((max, match) => Math.max(max, Number(match[1])), 0)
  replacements.set(relsPart, relsText.replace('</Relationships>',
    `<Relationship Id="rId${nextId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${next}.xml"/></Relationships>`))
  const typesName = '[Content_Types].xml'
  const types = (await pkg.readText(typesName)) ?? ''
  if (types !== '') {
    replacements.set(typesName, types.replace('</Types>',
      `<Override PartName="/${partName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>`))
  }
}

/** The edits a deck carries, keyed by slide part name. */
export interface DeckEdits {
  /** Text edits keyed by `${slidePart}#${shapeId}`. */
  readonly texts: ReadonlyMap<string, readonly string[]>
  /** Speaker notes keyed by slide part name. */
  readonly notes: ReadonlyMap<string, string>
}

/**
 * Build the edited presentation: original container with only the touched
 * slide, notes, relationship, and content-type parts rewritten.
 * @param original - the complete source container.
 * @param edits - the user's text and notes edits.
 * @returns the edited container bytes.
 */
export async function buildEditedPackage(
  original: Uint8Array,
  edits: DeckEdits,
): Promise<Uint8Array> {
  const pkg = ZipPackage.open(original)
  const replacements = new Map<string, string>()
  const parts = new Map<string, { shapeId: string; lines: readonly string[] }[]>()
  for (const [key, lines] of edits.texts) {
    const separator = key.lastIndexOf('#')
    if (separator === -1) continue
    const part = key.slice(0, separator)
    const shapeId = key.slice(separator + 1)
    const list = parts.get(part) ?? []
    list.push({ shapeId, lines })
    parts.set(part, list)
  }
  for (const [part, shapeEdits] of parts) {
    const text = await pkg.readText(part)
    if (text === undefined) continue
    let patched = text
    for (const { shapeId, lines } of shapeEdits) {
      patched = patchShapeText(patched, shapeId, lines)
    }
    replacements.set(part, patched)
  }
  for (const [slidePart, notesText] of edits.notes) {
    const notesPart = await notesPartOf(pkg, slidePart)
    const lines = notesText.split('\n')
    if (notesPart === undefined) {
      await createNotesPart(pkg, replacements, slidePart, lines)
    } else {
      const text = await pkg.readText(notesPart)
      if (text !== undefined) replacements.set(notesPart, patchNotesPart(text, lines))
    }
  }
  if (replacements.size === 0) return original
  return rewriteZip(original, replacements)
}

/**
 * Replace one shape's text runs in slide XML, matching the shape by its
 * `p:cNvPr` id and keeping the first run's properties per paragraph.
 * @param text - the slide part's XML text.
 * @param shapeId - the `p:cNvPr` id of the shape.
 * @param lines - one line per paragraph.
 * @returns the patched XML text.
 */
function patchShapeText(text: string, shapeId: string, lines: readonly string[]): string {
  const paragraphs = (lines.length === 0 ? [''] : lines)
    .map(line => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`)
    .join('')
  const idPattern = new RegExp(`<p:cNvPr id="${escapeRegExp(shapeId)}"`)
  const idMatch = idPattern.exec(text)
  if (idMatch === null) return text
  const spStart = text.lastIndexOf('<p:sp>', idMatch.index)
  const txBodyOpen = text.indexOf('<p:txBody', spStart === -1 ? idMatch.index : spStart)
  if (txBodyOpen === -1) return text
  const firstParagraph = text.indexOf('<a:p>', txBodyOpen)
  const txBodyClose = text.indexOf('</p:txBody>', txBodyOpen)
  if (firstParagraph === -1 || txBodyClose === -1 || firstParagraph > txBodyClose) return text
  return `${text.slice(0, firstParagraph)}${paragraphs}${text.slice(txBodyClose)}`
}

/** Escape a string for a literal regular expression. */
function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
