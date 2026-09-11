/**
 * OOXML unit conversion.
 *
 * OOXML measures geometry in English Metric Units, text in hundredths of a
 * point, and angles in sixtieth-thousandths of a degree. The renderer works in
 * CSS pixels at the 96 DPI the DrawingML spec assumes for EMU, so every unit
 * crossing into the render model is converted once, here.
 */

/** English Metric Units per CSS pixel at 96 DPI (914400 EMU/inch ÷ 96). */
export const EMU_PER_PX = 9525

/** CSS pixels per point at 96 DPI (96 ÷ 72). */
const PX_PER_PT = 4 / 3

/**
 * Convert English Metric Units to CSS pixels.
 * @param emu - the EMU measurement.
 * @returns the equivalent pixel measurement.
 */
export function emuToPx(emu: number): number {
  return emu / EMU_PER_PX
}

/**
 * Convert points to CSS pixels.
 * @param points - the point measurement.
 * @returns the equivalent pixel measurement.
 */
export function ptToPx(points: number): number {
  return points * PX_PER_PT
}

/**
 * Convert hundredths of a point, as `sz` attributes carry them, to CSS pixels.
 * @param hundredths - the raw `sz` value.
 * @returns the equivalent pixel measurement.
 */
export function hundredthPtToPx(hundredths: number): number {
  return ptToPx(hundredths / 100)
}

/**
 * Convert hundredths of a point to points.
 * @param hundredths - the raw `sz` value.
 * @returns the point measurement.
 */
export function hundredthPtToPt(hundredths: number): number {
  return hundredths / 100
}

/**
 * Convert a DrawingML angle to degrees.
 * @param sixtyThousandths - the raw angle value.
 * @returns the angle in degrees.
 */
export function angleToDegrees(sixtyThousandths: number): number {
  return sixtyThousandths / 60000
}

/**
 * Convert a DrawingML percentage of a thousand to a unit fraction.
 * @param thousandths - the raw percentage value, where 100000 is 100%.
 * @returns the fraction, where 1 is 100%.
 */
export function fraction(thousandths: number): number {
  return thousandths / 100000
}

/**
 * Round a pixel measurement to a stable precision for DOM output.
 * @param px - the measurement.
 * @returns the measurement rounded to four decimals.
 */
export function roundPx(px: number): number {
  return Math.round(px * 10000) / 10000
}

/** Twips per point, the unit WordprocessingML measures layout in. */
const TWIPS_PER_PT = 20

/**
 * Convert twips to CSS pixels.
 * @param twips - the twip measurement, as `w:pgSz`, `w:pgMar`, and `w:ind` carry it.
 * @returns the equivalent pixel measurement.
 */
export function twipsToPx(twips: number): number {
  return twips / TWIPS_PER_PT * PX_PER_PT
}

/**
 * Convert half-points to CSS pixels.
 * @param halfPoints - the raw `w:sz` value, where 24 is 12pt.
 * @returns the equivalent pixel measurement.
 */
export function halfPtToPx(halfPoints: number): number {
  return halfPoints / 2 * PX_PER_PT
}

/**
 * Convert eighths of a point to CSS pixels.
 * @param eighths - the raw border `w:sz` value, where 8 is 1pt.
 * @returns the equivalent pixel measurement.
 */
export function eighthPtToPx(eighths: number): number {
  return eighths / 8 * PX_PER_PT
}
