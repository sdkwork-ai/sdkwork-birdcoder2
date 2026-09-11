/**
 * Namespace-aware XML access for OOXML parts.
 *
 * Every lookup states the namespace it means, so a part written with any
 * prefix (`a:`, `ns1:`) resolves identically. Direct-child and descendant
 * access are separate operations because OOXML reuses the same local names at
 * different depths — `a:solidFill` under `p:spPr` is a shape fill, the same
 * name under `a:ln` is a line fill — and conflating them reads the wrong one.
 */

/** DrawingML main namespace. */
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
/** PresentationML namespace. */
export const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
/** Office relationship-reference namespace. */
export const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
/** OPC package relationship-part namespace. */
export const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

/** Raised when a part is not well-formed XML. */
export class XmlParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XmlParseError'
  }
}

/**
 * Parse one XML part.
 * @param text - the part's decoded text.
 * @param partName - part name for diagnostics.
 * @returns the parsed document.
 * @throws {XmlParseError} when the part is not well-formed.
 */
export function parseXml(text: string, partName: string): XMLDocument {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  const failure = document.querySelector('parsererror')
  if (failure !== null) throw new XmlParseError(`${partName} is not well-formed XML`)
  return document
}

/**
 * The root element of a part.
 *
 * A parsed part always has one: a malformed part yields a `parsererror`
 * document, which {@link parseXml} rejects before its root is read.
 * @param document - the parsed part.
 * @returns the document element.
 */
export function rootOf(document: XMLDocument): Element {
  return document.documentElement
}
/**
 * Direct element children matching a namespace and local name.
 * @param parent - containing element.
 * @param ns - required namespace URI.
 * @param local - required local name; omit to accept any local name.
 * @returns the matching children in document order.
 */
export function children(parent: Element | undefined | null, ns: string, local?: string): readonly Element[] {
  if (parent === null || parent === undefined) return []
  const found: Element[] = []
  for (const node of Array.from(parent.children)) {
    if (node.namespaceURI !== ns) continue
    if (local !== undefined && node.localName !== local) continue
    found.push(node)
  }
  return found
}

/**
 * The first direct element child matching a namespace and local name.
 * @param parent - containing element.
 * @param ns - required namespace URI.
 * @param local - required local name.
 * @returns the first match, or undefined.
 */
export function child(parent: Element | undefined | null, ns: string, local: string): Element | undefined {
  return children(parent, ns, local)[0]
}

/**
 * Every descendant matching a namespace and local name.
 * @param parent - containing element.
 * @param ns - required namespace URI.
 * @param local - required local name.
 * @returns the matching descendants in document order.
 */
export function descendants(parent: Element | undefined | null, ns: string, local: string): readonly Element[] {
  if (parent === null || parent === undefined) return []
  return Array.from(parent.getElementsByTagNameNS(ns, local))
}

/**
 * The first descendant matching a namespace and local name.
 * @param parent - containing element.
 * @param ns - required namespace URI.
 * @param local - required local name.
 * @returns the first match, or undefined.
 */
export function descendant(parent: Element | undefined | null, ns: string, local: string): Element | undefined {
  return descendants(parent, ns, local)[0]
}

/**
 * Read an unprefixed attribute.
 * @param node - element to read.
 * @param name - attribute name.
 * @returns the attribute value, or undefined when absent.
 */
export function attr(node: Element | undefined | null, name: string): string | undefined {
  return node?.getAttribute(name) ?? undefined
}

/**
 * Read a namespace-qualified attribute.
 * @param node - element to read.
 * @param ns - attribute namespace URI.
 * @param name - attribute local name.
 * @returns the attribute value, or undefined when absent.
 */
export function attrNs(node: Element | undefined | null, ns: string, name: string): string | undefined {
  return node?.getAttributeNS(ns, name) ?? undefined
}

/**
 * Read an unprefixed integer attribute.
 * @param node - element to read.
 * @param name - attribute name.
 * @returns the parsed value, or undefined when absent or not a number.
 */
export function numberAttr(node: Element | undefined | null, name: string): number | undefined {
  const raw = attr(node, name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Read a boolean attribute written in OOXML's `1`/`true`/`0`/`false` forms.
 * @param node - element to read.
 * @param name - attribute name.
 * @returns the value, or undefined when absent.
 */
export function boolAttr(node: Element | undefined | null, name: string): boolean | undefined {
  const raw = attr(node, name)
  if (raw === undefined) return undefined
  return raw === '1' || raw === 'true'
}
