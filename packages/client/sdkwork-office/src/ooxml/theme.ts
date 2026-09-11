/**
 * Theme extraction.
 *
 * Both office formats carry the same `a:theme` part: a colour scheme of named
 * entries and a font scheme of major/minor typefaces. Reading it once per
 * package gives every downstream colour and text resolution a plain record to
 * work from.
 */
import { attr, child, children, NS_A } from './xml.ts'

/** Theme typefaces, as OOXML font-scheme roles. */
export interface ThemeFonts {
  readonly majorLatin: string
  readonly minorLatin: string
  readonly majorEa: string
  readonly minorEa: string
}

/** A package's theme: the colour scheme entries and the font roles. */
export interface Theme {
  /** Scheme entry names mapped to six-digit hex, with OOXML defaults filled in. */
  readonly scheme: Readonly<Record<string, string | undefined>>
  readonly fonts: ThemeFonts
}

/** Font roles a document falls back to when its theme states none. */
export const DEFAULT_THEME_FONTS: ThemeFonts = {
  majorLatin: 'Calibri',
  minorLatin: 'Calibri',
  majorEa: '',
  minorEa: '',
}

/** Office's default theme scheme, used when a package omits or breaks its theme part. */
export const DEFAULT_THEME_SCHEME: Readonly<Record<string, string>> = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '44546A',
  lt2: 'E7E6E6',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '5B9BD5',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
}

/**
 * Read the colour scheme out of a theme part.
 * @param themeRoot - the `a:theme` root element.
 * @returns scheme entry names mapped to six-digit hex values.
 */
function readScheme(themeRoot: Element | undefined): Readonly<Record<string, string>> {
  const scheme = child(child(themeRoot, NS_A, 'themeElements'), NS_A, 'clrScheme')
  if (scheme === undefined) return DEFAULT_THEME_SCHEME
  const entries: Record<string, string> = {}
  for (const entry of children(scheme, NS_A)) {
    const srgb = child(entry, NS_A, 'srgbClr')
    const sys = child(entry, NS_A, 'sysClr')
    const value = attr(srgb, 'val') ?? attr(sys, 'lastClr') ?? attr(sys, 'val')
    if (value !== undefined) entries[entry.localName] = value
  }
  return { ...DEFAULT_THEME_SCHEME, ...entries }
}

/**
 * Read the major and minor typefaces out of a theme part.
 * @param themeRoot - the `a:theme` root element.
 * @returns the theme's font roles.
 */
function readFonts(themeRoot: Element | undefined): ThemeFonts {
  const scheme = child(child(themeRoot, NS_A, 'themeElements'), NS_A, 'fontScheme')
  if (scheme === undefined) return DEFAULT_THEME_FONTS
  const read = (role: 'majorFont' | 'minorFont'): { readonly latin: string; readonly ea: string } => {
    const font = child(scheme, NS_A, role)
    return {
      latin: attr(child(font, NS_A, 'latin'), 'typeface') ?? '',
      ea: attr(child(font, NS_A, 'ea'), 'typeface') ?? '',
    }
  }
  const major = read('majorFont')
  const minor = read('minorFont')
  return {
    majorLatin: major.latin || DEFAULT_THEME_FONTS.majorLatin,
    minorLatin: minor.latin || DEFAULT_THEME_FONTS.minorLatin,
    majorEa: major.ea,
    minorEa: minor.ea,
  }
}

/**
 * Read a theme part into the scheme and font roles later parsing needs.
 * @param themeRoot - the `a:theme` root element, when the package has one.
 * @returns the theme with OOXML defaults filled in.
 */
export function readTheme(themeRoot: Element | undefined): Theme {
  return { scheme: readScheme(themeRoot), fonts: readFonts(themeRoot) }
}
