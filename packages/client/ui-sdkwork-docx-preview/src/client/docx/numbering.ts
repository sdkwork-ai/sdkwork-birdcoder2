/**
 * The WordprocessingML numbering definitions.
 *
 * A numbered paragraph names a numbering instance and a level; the instance
 * points at an abstract definition holding the level's format, its marker text,
 * and the indent it imposes. The marker for `%2` is the running counter of
 * level two, so the resolver keeps one counter array per numbering instance and
 * advances it as the document is walked in order.
 */
import { child, children } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { Theme } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { ParaFormat, RunFormat } from './format.ts'
import { readParaFormat, readRunFormat } from './format.ts'
import { NS_W, wAttr, wNum } from './names.ts'

/** The deepest level WordprocessingML numbering defines. */
const MAX_LEVELS = 9

/** One numbering level's marker definition. */
interface NumberingLevel {
  readonly format: string
  readonly text: string
  readonly start: number
  /** What Word writes between the marker and the paragraph text. */
  readonly suffix: string
  readonly run: RunFormat
  readonly para: ParaFormat
}

/** One numbering instance, resolved to its abstract definition. */
interface NumberingInstance {
  readonly abstractId: string
  /** Level overrides keyed by level index. */
  readonly overrides: ReadonlyMap<number, LevelOverride>
}

/** A numbering instance's override for one level. */
interface LevelOverride {
  readonly start?: number
  readonly level?: NumberingLevel
}

/** The marker a numbered paragraph shows, with the style and indent it carries. */
export interface NumberingMarker {
  readonly text: string
  readonly suffix: string
  readonly run: RunFormat
  readonly para: ParaFormat
}

/** Produces list markers while a document is walked in order. */
export interface NumberingResolver {
  /**
   * The marker for one numbered paragraph, advancing that instance's counters.
   * @param numId - `w:numId` value naming the numbering instance.
   * @param level - zero-based level index.
   * @returns the marker, or undefined when the instance or level is not defined.
   */
  marker(numId: number, level: number): NumberingMarker | undefined
}

/** A resolver for a package with no numbering part. */
const NO_NUMBERING: NumberingResolver = { marker: () => undefined }

/** Format an ordinal as upper-case letters, as `upperLetter` numbering does. */
function letters(value: number): string {
  let remaining = Math.max(1, Math.round(value))
  let text = ''
  while (remaining > 0) {
    const offset = (remaining - 1) % 26
    text = String.fromCharCode(65 + offset) + text
    remaining = Math.floor((remaining - 1) / 26)
  }
  return text
}

/** Format an ordinal as a Roman numeral. */
function roman(value: number): string {
  const table: readonly (readonly [number, string])[] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let remaining = Math.max(1, Math.round(value))
  let text = ''
  for (const [amount, glyph] of table) {
    while (remaining >= amount) {
      text += glyph
      remaining -= amount
    }
  }
  return text
}

/**
 * Render one counter in the format its level names.
 * @param format - the level's `w:numFmt` value.
 * @param value - the counter value.
 * @returns the formatted ordinal.
 */
function formatValue(format: string, value: number): string {
  if (format === 'lowerLetter') return letters(value).toLowerCase()
  if (format === 'upperLetter') return letters(value)
  if (format === 'lowerRoman') return roman(value).toLowerCase()
  if (format === 'upperRoman') return roman(value)
  if (format === 'decimalZero') return String(value).padStart(2, '0')
  if (format === 'none') return ''
  return String(value)
}

/**
 * Read one `w:lvl` element.
 * @param element - the level element.
 * @param theme - the document theme.
 * @returns the level's marker definition.
 */
function readLevel(element: Element, theme: Theme): NumberingLevel {
  return {
    format: wAttr(child(element, NS_W, 'numFmt'), 'val') ?? 'decimal',
    text: wAttr(child(element, NS_W, 'lvlText'), 'val') ?? '',
    start: wNum(child(element, NS_W, 'start'), 'val') ?? 1,
    suffix: wAttr(child(element, NS_W, 'suff'), 'val') ?? 'tab',
    run: readRunFormat(child(element, NS_W, 'rPr'), theme),
    para: readParaFormat(child(element, NS_W, 'pPr'), theme),
  }
}

/**
 * Collect an abstract numbering definition's levels.
 * @param element - the `w:abstractNum` element.
 * @param theme - the document theme.
 * @returns the levels keyed by level index.
 */
function readAbstractLevels(element: Element, theme: Theme): ReadonlyMap<number, NumberingLevel> {
  const levels = new Map<number, NumberingLevel>()
  for (const level of children(element, NS_W, 'lvl')) {
    const index = wNum(level, 'ilvl')
    if (index === undefined || index < 0 || index >= MAX_LEVELS) continue
    levels.set(index, readLevel(level, theme))
  }
  return levels
}

/**
 * Read a document's numbering part into a resolver.
 * @param numberingRoot - the `w:numbering` root element, or undefined when the package has no numbering part.
 * @param theme - the document theme.
 * @returns the resolver numbered paragraphs read their markers through.
 */
export function readNumbering(numberingRoot: Element | undefined, theme: Theme): NumberingResolver {
  if (numberingRoot === undefined) return NO_NUMBERING
  const abstracts = new Map<string, ReadonlyMap<number, NumberingLevel>>()
  for (const element of children(numberingRoot, NS_W, 'abstractNum')) {
    const id = wAttr(element, 'abstractNumId')
    if (id === undefined) continue
    abstracts.set(id, readAbstractLevels(element, theme))
  }
  const instances = new Map<number, NumberingInstance>()
  for (const element of children(numberingRoot, NS_W, 'num')) {
    const numId = wNum(element, 'numId')
    const abstractId = wAttr(child(element, NS_W, 'abstractNumId'), 'val')
    if (numId === undefined || abstractId === undefined) continue
    const overrides = new Map<number, LevelOverride>()
    for (const override of children(element, NS_W, 'lvlOverride')) {
      const index = wNum(override, 'ilvl')
      if (index === undefined) continue
      const level = child(override, NS_W, 'lvl')
      overrides.set(index, {
        start: wNum(child(override, NS_W, 'startOverride'), 'val'),
        ...(level === undefined ? {} : { level: readLevel(level, theme) }),
      })
    }
    instances.set(numId, { abstractId, overrides })
  }

  // Counters live per abstract definition, not per instance: Word continues
  // the count across instances that share one abstract numbering. An instance
  // that overrides a level's start seeds its own counter there, restarting
  // that level for itself alone.
  const counters = new Map<string, number[]>()
  const seeded = new Set<string>()
  return {
    marker(numId: number, level: number): NumberingMarker | undefined {
      const instance = instances.get(numId)
      if (instance === undefined) return undefined
      const definition = instance.overrides.get(level)?.level ?? abstracts.get(instance.abstractId)?.get(level)
      if (definition === undefined) return undefined
      const overrideStart = instance.overrides.get(level)?.start
      const values = counters.get(instance.abstractId) ?? []
      const seedKey = overrideStart === undefined ? `${instance.abstractId}:${level}` : `${numId}:${level}`
      if (!seeded.has(seedKey)) {
        seeded.add(seedKey)
        values[level] = (overrideStart ?? definition.start) - 1
      }
      values[level] = (values[level] ?? 0) + 1
      // A deeper counter restarts when a shallower level advances: forget its
      // seed so its next marker begins at the level's own start value again.
      for (let deeper = level + 1; deeper < MAX_LEVELS; deeper += 1) {
        values[deeper] = 0
        seeded.delete(`${instance.abstractId}:${deeper}`)
        seeded.delete(`${numId}:${deeper}`)
      }
      counters.set(instance.abstractId, values)
      const text = definition.format === 'bullet'
        ? definition.text
        : definition.text.replaceAll(/%([1-9])/gu, (match, index: string) => {
          const referenced = Number(index) - 1
          const referencedLevel = instance.overrides.get(referenced)?.level
            ?? abstracts.get(instance.abstractId)?.get(referenced)
          return referencedLevel === undefined ? match : formatValue(referencedLevel.format, values[referenced] ?? 1)
        })
      return { text, suffix: definition.suffix, run: definition.run, para: definition.para }
    },
  }
}
