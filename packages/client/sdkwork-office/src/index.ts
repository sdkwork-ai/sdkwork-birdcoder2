/**
 * Shared OOXML primitives for the SDKWork office document previews.
 *
 * This is a browser-safe library, not a plugin: it registers nothing and has no
 * runtime identity to share. Each preview bundle inlines its own copy, which is
 * why nothing here holds module-level mutable state.
 */

export {
  attr, attrNs, boolAttr, child, children, descendant, descendants,
  NS_A, NS_P, NS_R, NS_REL, numberAttr, parseXml, rootOf, XmlParseError,
} from './ooxml/xml.ts'

export { ZipFormatError, ZipPackage } from './ooxml/zip.ts'
export type { StoredPart, ZipEntryRecord } from './ooxml/zip.ts'

export { crc32, rewriteZip } from './ooxml/zip-write.ts'

export { isOle2Container } from './ooxml/container.ts'

export {
  readPartRelationships, readRelationships, relsPartName, resolveTarget, targetOf,
  REL_IMAGE, REL_OFFICE_DOCUMENT, REL_THEME,
} from './ooxml/rels.ts'
export type { Relationship } from './ooxml/rels.ts'

export {
  DEFAULT_THEME_FONTS, DEFAULT_THEME_SCHEME, readTheme,
} from './ooxml/theme.ts'
export type { Theme, ThemeFonts } from './ooxml/theme.ts'

export {
  applyTintShade, colorChildOf, colorOf, hexToRgb, resolveColorElement, rgbToCss,
} from './ooxml/color.ts'
export type { ColorContext, CssColor, Rgb } from './ooxml/color.ts'

export {
  angleToDegrees, eighthPtToPx, emuToPx, fraction, halfPtToPx, hundredthPtToPx, hundredthPtToPt,
  ptToPx, roundPx, twipsToPx, EMU_PER_PX,
} from './ooxml/units.ts'

export { DEFAULT_PAGED_VIEW, pagedViewStore } from './paged-view.ts'
export type { PagedView, PagedViewActions, PagedViewState, PagedViewStore, PagedZoom } from './paged-view.ts'
