/**
 * WordprocessingML names, attribute access, and the units its attributes use.
 *
 * The shared OOXML library owns the container, namespace-aware element access,
 * relationship resolution, and unit conversion. This module states what
 * WordprocessingML adds on top: its four namespaces, the relationship kinds the
 * main document part declares, and the on/off and numeric attribute forms its
 * elements use.
 */
import { attrNs, child } from '@deepseek-ai/dsh-client-sdkwork-office'

/** WordprocessingML main namespace. */
export const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
/** WordprocessingML drawing namespace, holding a drawing's inline and anchored placements. */
export const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
/** DrawingML picture namespace, holding the picture frame inside a drawing. */
export const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture'
/** VML namespace, which carries the drawings written before DrawingML. */
export const NS_V = 'urn:schemas-microsoft-com:vml'

/** Relationship type suffix naming a document's style part. */
export const REL_STYLES = '/styles'
/** Relationship type suffix naming a document's numbering part. */
export const REL_NUMBERING = '/numbering'
/** Relationship type suffix naming a document's settings part. */
export const REL_SETTINGS = '/settings'
/** Relationship type suffix naming a section's header part. */
export const REL_HEADER = '/header'
/** Relationship type suffix naming a section's footer part. */
export const REL_FOOTER = '/footer'
/** Relationship type suffix naming an external hyperlink target. */
export const REL_HYPERLINK = '/hyperlink'

/**
 * Read a WordprocessingML attribute by local name.
 *
 * WordprocessingML writes its attributes in the `w` namespace under an
 * arbitrary prefix, so every read goes through the namespace rather than
 * through a spelling.
 * @param node - element to read.
 * @param name - attribute local name, such as `val` or `w`.
 * @returns the attribute value, or undefined when absent.
 */
export function wAttr(node: Element | undefined | null, name: string): string | undefined {
  return attrNs(node, NS_W, name)
}

/**
 * Read a WordprocessingML numeric attribute.
 * @param node - element to read.
 * @param name - attribute local name.
 * @returns the parsed value, or undefined when absent or not a finite number.
 */
export function wNum(node: Element | undefined | null, name: string): number | undefined {
  const raw = wAttr(node, name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Read a WordprocessingML on/off flag element.
 *
 * A present flag element is on unless it states `0`, `false`, or `off`; an
 * absent one states nothing and stays undefined so a cascade can inherit.
 * @param parent - element that may hold the flag.
 * @param name - the flag element's local name, such as `b` or `keepNext`.
 * @returns the flag, or undefined when the element is absent.
 */
export function wOnOff(parent: Element | undefined | null, name: string): boolean | undefined {
  const element = child(parent, NS_W, name)
  if (element === undefined) return undefined
  const value = wAttr(element, 'val')
  return value !== '0' && value !== 'false' && value !== 'off'
}

/**
 * Read a WordprocessingML on/off attribute written in the same spelling.
 * @param node - element to read.
 * @param name - attribute local name.
 * @returns the flag, or undefined when the attribute is absent.
 */
export function wFlag(node: Element | undefined | null, name: string): boolean | undefined {
  const value = wAttr(node, name)
  if (value === undefined) return undefined
  return value !== '0' && value !== 'false' && value !== 'off'
}
