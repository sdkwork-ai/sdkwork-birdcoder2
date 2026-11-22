/**
 * The width a run of text paints at, as the in-cell editor needs it.
 *
 * Excel grows the edit field only when the draft no longer fits the cell, which
 * is a measurement question. A canvas context measures it with the cell's own
 * font; an environment without one (the tests, a headless shell before the
 * canvas backend is up) falls back to an average-width estimate, which keeps
 * the growth direction and stop rules honest while the exact pixel is best
 * effort.
 */

/** The average glyph width of a cell font, as a fraction of its size. */
const AVERAGE_GLYPH_RATIO = 0.55

let context: CanvasRenderingContext2D | null | undefined

/**
 * The shared measuring context, created once.
 * @returns the context, or undefined when this environment has no canvas.
 */
function measuringContext(): CanvasRenderingContext2D | undefined {
  if (context !== undefined) return context ?? undefined
  if (typeof document === 'undefined') {
    context = null
    return undefined
  }
  context = document.createElement('canvas').getContext('2d')
  return context ?? undefined
}

/** The font facts a measurement draws with. */
export interface TextFont {
  /** The font family, unquoted. */
  readonly family: string
  /** The font size, in pixels. */
  readonly sizePx: number
  readonly bold?: boolean
  readonly italic?: boolean
}

/**
 * Measure the width a run of text paints at.
 * @param text - the text to measure.
 * @param font - the font it paints with.
 * @returns the width in pixels.
 */
export function textWidthPx(text: string, font: TextFont): number {
  if (text === '') return 0
  const ctx = measuringContext()
  if (ctx === undefined) return text.length * font.sizePx * AVERAGE_GLYPH_RATIO
  ctx.font = `${font.italic === true ? 'italic ' : ''}${font.bold === true ? '700 ' : '400 '}${font.sizePx}px "${font.family}"`
  return ctx.measureText(text).width
}
