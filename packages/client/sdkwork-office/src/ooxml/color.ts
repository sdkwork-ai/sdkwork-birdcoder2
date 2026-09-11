/**
 * DrawingML colour resolution.
 *
 * A colour in OOXML is a base plus a stack of modifiers, and a scheme
 * reference means something different on each slide because the colour map
 * renames the theme entries. Resolving therefore takes the element, the theme's
 * raw scheme, and the colour map in force; the result is a CSS colour, because
 * the renderers paint with CSS rather than with a colour object of their own.
 */
import { attr, child, children, NS_A } from './xml.ts'

/** A resolved colour ready for CSS, with its alpha already folded in. */
export type CssColor = string

/** The theme inputs one colour resolution needs. */
export interface ColorContext {
  /** Raw theme scheme entries by name (`dk1`, `lt1`, `accent1`, …); a theme need not define every name. */
  readonly scheme: Readonly<Record<string, string | undefined>>
  /**
   * Placeholder-name mapping in force, for formats that rename scheme entries.
   * WordprocessingML addresses scheme entries directly, so it omits this.
   */
  readonly colorMap?: Readonly<Record<string, string | undefined>>
}

/** Preset colour table entries the renderer can meet in real decks. */
const PRESET_COLORS: Readonly<Record<string, string | undefined>> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  yellow: 'FFFF00',
  gray: '808080',
  grey: '808080',
  silver: 'C0C0C0',
  maroon: '800000',
  olive: '808000',
  navy: '000080',
  purple: '800080',
  teal: '008080',
  lime: '00FF00',
  aqua: '00FFFF',
  fuchsia: 'FF00FF',
  orange: 'FFA500',
  dkGray: '808080',
  ltGray: 'C0C0C0',
  dkBlue: '000080',
  dkRed: '800000',
  dkGreen: '008000',
  dkYellow: '808000',
  dkGray2: '404040',
}

/** System colour names mapped to their conventional light-theme values. */
const SYSTEM_COLORS: Readonly<Record<string, string | undefined>> = {
  windowText: '000000',
  window: 'FFFFFF',
  captionText: '000000',
  buttonFace: 'F0F0F0',
  buttonText: '000000',
  highlight: '0078D7',
  highlightText: 'FFFFFF',
  grayText: '6D6D6D',
}

/** An RGB triple in 0–255. */
export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** An HSL triple with hue in degrees and the other two in 0–1. */
interface Hsl {
  h: number
  s: number
  l: number
}

/**
 * Parse six hexadecimal digits into an RGB triple.
 * @param hex - six digits, without a leading `#`.
 * @returns the parsed triple.
 */
export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(0, 6), 16)
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff }
}

/** Convert RGB in 0–255 to HSL. */
function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const delta = max - min
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  const hue = max === red
    ? ((green - blue) / delta + (green < blue ? 6 : 0))
    : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4
  return { h: hue * 60, s, l }
}

/** Convert HSL back to RGB in 0–255. */
function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const level = Math.round(l * 255)
    return { r: level, g: level, b: level }
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (offset: number): number => {
    let t = (h / 360 + offset) % 1
    if (t < 0) t += 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return {
    r: Math.round(channel(1 / 3) * 255),
    g: Math.round(channel(0) * 255),
    b: Math.round(channel(-1 / 3) * 255),
  }
}

/** Clamp a number into a range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Format an RGB triple and alpha as a CSS colour.
 * @param rgb - the channels, clamped into range.
 * @param alpha - opacity, where 1 is opaque.
 * @returns the CSS colour.
 */
export function rgbToCss(rgb: Rgb, alpha = 1): CssColor {
  const r = clamp(Math.round(rgb.r), 0, 255)
  const g = clamp(Math.round(rgb.g), 0, 255)
  const b = clamp(Math.round(rgb.b), 0, 255)
  if (alpha >= 1) {
    return `#${[r, g, b].map(part => part.toString(16).padStart(2, '0')).join('').toUpperCase()}`
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(4))})`
}

/**
 * Apply WordprocessingML's `themeTint` and `themeShade` byte modifiers.
 *
 * Both are hex bytes: `themeTint` mixes the colour toward white in proportion
 * to its value, `themeShade` scales it toward black. Word applies them in a
 * luminance space; a channel-wise mix is what the reference renderers use and
 * is visually equivalent at these magnitudes.
 * @param hex - the base colour's six digits.
 * @param tint - the raw `w:themeTint` value, or undefined.
 * @param shade - the raw `w:themeShade` value, or undefined.
 * @returns the modified CSS colour.
 */
export function applyTintShade(hex: string, tint: string | undefined, shade: string | undefined): CssColor {
  let rgb = hexToRgb(hex)
  const tintFraction = tint === undefined ? 0 : Number.parseInt(tint, 16) / 255
  if (Number.isFinite(tintFraction) && tintFraction > 0) {
    const mix = clamp(tintFraction, 0, 1)
    rgb = {
      r: rgb.r * (1 - mix) + 255 * mix,
      g: rgb.g * (1 - mix) + 255 * mix,
      b: rgb.b * (1 - mix) + 255 * mix,
    }
  }
  const shadeFraction = shade === undefined ? 1 : Number.parseInt(shade, 16) / 255
  if (Number.isFinite(shadeFraction) && shadeFraction < 1) {
    const scale = clamp(shadeFraction, 0, 1)
    rgb = { r: rgb.r * scale, g: rgb.g * scale, b: rgb.b * scale }
  }
  return rgbToCss(rgb)
}

/** The base colour of one DrawingML colour element, before its modifiers. */
function baseColor(element: Element, context: ColorContext): { rgb: Rgb; alpha: number } | undefined {
  switch (element.localName) {
    case 'srgbClr': {
      const value = attr(element, 'val')
      return value === undefined ? undefined : { rgb: hexToRgb(value), alpha: 1 }
    }
    case 'scrgbClr': {
      const scale = (name: string): number => Number(attr(element, name) ?? 0) / 100000
      const rgb = {
        r: clamp(scale('r') * 255, 0, 255),
        g: clamp(scale('g') * 255, 0, 255),
        b: clamp(scale('b') * 255, 0, 255),
      }
      return { rgb, alpha: 1 }
    }
    case 'schemeClr': {
      const requested = attr(element, 'val')
      if (requested === undefined) return undefined
      const mapped = context.colorMap?.[requested] ?? requested
      const hex = context.scheme[mapped] ?? context.scheme[requested]
      return hex === undefined ? undefined : { rgb: hexToRgb(hex), alpha: 1 }
    }
    case 'sysClr': {
      const fallback = attr(element, 'lastClr')
      const named = SYSTEM_COLORS[attr(element, 'val') ?? '']
      const hex = fallback ?? named
      return hex === undefined ? undefined : { rgb: hexToRgb(hex), alpha: 1 }
    }
    case 'prstClr': {
      const hex = PRESET_COLORS[attr(element, 'val') ?? '']
      return hex === undefined ? undefined : { rgb: hexToRgb(hex), alpha: 1 }
    }
    case 'hslClr': {
      const value = (name: string): number => Number(attr(element, name) ?? 0)
      return {
        rgb: hslToRgb({ h: value('hue') / 60000, s: value('sat') / 100000, l: value('lum') / 100000 }),
        alpha: 1,
      }
    }
    default:
      return undefined
  }
}

/**
 * Resolve one DrawingML colour element, applying its modifier children.
 * @param element - a colour element such as `a:srgbClr` or `a:schemeClr`.
 * @param context - theme scheme and active colour map.
 * @returns a CSS colour, or undefined when the element names no known colour.
 */
export function resolveColorElement(element: Element | undefined, context: ColorContext): CssColor | undefined {
  if (element === undefined) return undefined
  const base = baseColor(element, context)
  if (base === undefined) return undefined
  let rgb = base.rgb
  let alpha = base.alpha
  for (const modifier of children(element, NS_A)) {
    const value = Number(attr(modifier, 'val') ?? '')
    if (!Number.isFinite(value)) continue
    switch (modifier.localName) {
      case 'alpha':
        alpha *= clamp(value / 100000, 0, 1)
        break
      case 'lumMod': {
        const hsl = rgbToHsl(rgb)
        rgb = hslToRgb({ ...hsl, l: clamp(hsl.l * (value / 100000), 0, 1) })
        break
      }
      case 'lumOff': {
        const hsl = rgbToHsl(rgb)
        rgb = hslToRgb({ ...hsl, l: clamp(hsl.l + value / 100000, 0, 1) })
        break
      }
      case 'satMod': {
        const hsl = rgbToHsl(rgb)
        rgb = hslToRgb({ ...hsl, s: clamp(hsl.s * (value / 100000), 0, 1) })
        break
      }
      case 'shade': {
        const factor = value / 100000
        rgb = { r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor }
        break
      }
      case 'tint': {
        const factor = value / 100000
        rgb = {
          r: rgb.r * factor + 255 * (1 - factor),
          g: rgb.g * factor + 255 * (1 - factor),
          b: rgb.b * factor + 255 * (1 - factor),
        }
        break
      }
      default:
        break
    }
  }
  return rgbToCss(rgb, alpha)
}

/**
 * Resolve the colour of a fill or line container.
 * @param container - an element such as `a:solidFill` holding one colour child.
 * @param context - theme scheme and active colour map.
 * @returns a CSS colour, or undefined when the container holds no colour.
 */
export function colorOf(container: Element | undefined, context: ColorContext): CssColor | undefined {
  const element = children(container, NS_A)[0]
  return resolveColorElement(element, context)
}

/**
 * Resolve the colour of an effects or text-run colour holder (`a:*Fill` or a run's own colour child).
 * @param holder - an element whose first colour-bearing child names the colour.
 * @param context - theme scheme and active colour map.
 * @returns a CSS colour, or undefined.
 */
export function colorChildOf(holder: Element | undefined, context: ColorContext): CssColor | undefined {
  if (holder === undefined) return undefined
  for (const candidate of [child(holder, NS_A, 'srgbClr'), child(holder, NS_A, 'schemeClr'),
    child(holder, NS_A, 'sysClr'), child(holder, NS_A, 'prstClr'), child(holder, NS_A, 'scrgbClr'),
    child(holder, NS_A, 'hslClr')]) {
    if (candidate === undefined) continue
    return resolveColorElement(candidate, context)
  }
  return undefined
}
