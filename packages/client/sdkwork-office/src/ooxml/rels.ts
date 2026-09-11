/**
 * OPC relationship resolution.
 *
 * A part reaches another part by relationship id, and the target is written
 * relative to the referring part's directory. Both the OOXML reference
 * namespace and part-name normalization live here so parsing can work with
 * package-absolute names throughout.
 */
import { attr, children, NS_REL, parseXml, rootOf } from './xml.ts'
import type { ZipPackage } from './zip.ts'

/** One relationship declared by a `.rels` part. */
export interface Relationship {
  readonly id: string
  readonly type: string
  /** Package-absolute target part name, already normalized. */
  readonly target: string
  readonly external: boolean
}

/**
 * Relationship type suffixes both office formats use.
 *
 * Each format declares its own part kinds on top of these; only the suffixes
 * WordprocessingML and PresentationML share live here.
 */
export const REL_OFFICE_DOCUMENT = '/officeDocument'
/** Relationship type suffix ending a theme reference. */
export const REL_THEME = '/relationships/theme'
/** Relationship type suffix ending an image reference. */
export const REL_IMAGE = '/relationships/image'

/**
 * Normalize a package part name.
 *
 * OPC writes part names with a leading slash and ZIP entries without one. The
 * reader normalizes to the ZIP form so one spelling reaches the container.
 * @param path - slash-separated part name, with or without a leading slash.
 * @returns the normalized part name.
 */
function normalize(path: string): string {
  const segments: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

/**
 * Resolve a relationship target against the part that declared it.
 * @param basePart - package part name of the declaring part.
 * @param target - the raw target as written in the `.rels` part.
 * @returns the package part name.
 */
export function resolveTarget(basePart: string, target: string): string {
  if (target.startsWith('/')) return normalize(target)
  const directory = basePart.slice(0, basePart.lastIndexOf('/'))
  return normalize(`${directory}/${target}`)
}

/**
 * The `.rels` part name for a given part.
 * @param partName - package part name; the empty string is the package root.
 * @returns the name of the part holding its relationships.
 */
export function relsPartName(partName: string): string {
  const directory = partName.slice(0, Math.max(0, partName.lastIndexOf('/')))
  const base = partName.slice(partName.lastIndexOf('/') + 1)
  return normalize(`${directory}/_rels/${base}.rels`)
}

/**
 * Parse a `.rels` part.
 * @param text - the decoded part text.
 * @param sourcePart - the part that declares these relationships; the empty
 * string means the package root, whose targets are package-absolute.
 * @returns the declared relationships, keyed by id.
 */
export function readRelationships(text: string, sourcePart: string): ReadonlyMap<string, Relationship> {
  const partName = relsPartName(sourcePart)
  const root = rootOf(parseXml(text, partName))
  const relationships = new Map<string, Relationship>()
  for (const node of children(root, NS_REL, 'Relationship')) {
    const id = attr(node, 'Id')
    const type = attr(node, 'Type')
    const target = attr(node, 'Target')
    if (id === undefined || type === undefined || target === undefined) continue
    const external = attr(node, 'TargetMode') === 'External'
    relationships.set(id, {
      id,
      type,
      target: external ? target : resolveTarget(sourcePart, target),
      external,
    })
  }
  return relationships
}

/**
 * Find a relationship by id and check its type suffix.
 * @param relationships - the referring part's relationships.
 * @param id - relationship id from the XML.
 * @param suffix - required relationship type suffix.
 * @returns the target part name, or undefined when absent or of another type.
 */
export function targetOf(
  relationships: ReadonlyMap<string, Relationship>,
  id: string | undefined,
  suffix: string,
): string | undefined {
  if (id === undefined) return undefined
  const relationship = relationships.get(id)
  if (relationship === undefined || relationship.external) return undefined
  return relationship.type.endsWith(suffix) ? relationship.target : undefined
}

/**
 * Read the relationships a part declares.
 *
 * Every part that reaches another part — a document to its styles, a worksheet
 * to its drawing, a presentation to a slide — starts here, and a part that
 * declares none is ordinary rather than an error.
 * @param pkg - the open package.
 * @param partName - the declaring part; the empty string is the package root.
 * @returns the relationships by id, empty when the part declares none.
 */
export async function readPartRelationships(
  pkg: ZipPackage,
  partName: string,
): Promise<ReadonlyMap<string, Relationship>> {
  const text = await pkg.readText(relsPartName(partName))
  return text === undefined ? new Map() : readRelationships(text, partName)
}
