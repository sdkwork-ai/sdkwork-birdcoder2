/**
 * The record-drawer surface alias, pinned in both palettes as CSS text: jsdom
 * has no colors, and the two surfaces that paint it — the harness `Drawer` and
 * the embedded SDKWork IAM drawer — read the same custom property, so the
 * palettes must define it for the light and the dark scheme alike. The light
 * palette seats it on the panel tone the drawer slides over; the dark palette
 * seats it below that tone, which is the darker sheet the embedded drawer has
 * always painted.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseRules, type CssRule } from './stylesheet-scan.ts'

const ALIAS = '--dsw-alias-bg-drawer'

const css = readFileSync(fileURLToPath(new URL('../src/styles/design-platform.css', import.meta.url)), 'utf8')

/** Rules declaring the record-drawer alias, in source order. */
const drawerRules = parseRules(css)
  .filter(rule => rule.declarations.some(([property]) => property === ALIAS))

/**
 * The alias value declared beside one palette selector.
 * @param selector - the palette block's selector, as authored.
 * @returns the authored value, or undefined when that block does not declare it.
 */
function paletteValue(selector: string): string | undefined {
  const rule = drawerRules.find(candidate => candidate.selectors.includes(selector))
  return rule?.declarations.find(([property]) => property === ALIAS)?.[1]
}

/**
 * One rule's declaration value.
 * @param rule - a flattened rule.
 * @param property - custom-property name.
 * @returns the authored value, or undefined when the rule does not declare it.
 */
function value(rule: CssRule, property: string): string | undefined {
  return rule.declarations.find(([name]) => name === property)?.[1]
}

describe('record-drawer surface alias', () => {
  it('is declared once for each palette', () => {
    // The light palette resolves the alias in its plain `body` block and the
    // dark palette in the `data-ds-dark-theme` block; a third declaration would
    // mean a scheme-specific override that one of the two surfaces misses.
    expect(drawerRules.map(rule => rule.selectors.join(', '))).toEqual([
      'body',
      'body[data-ds-dark-theme]',
    ])
  })

  it('follows the palette steps the drawer tones are built from', () => {
    // Light: the panel tone (pure white), matching the modal it opens over.
    expect(paletteValue('body')).toBe('var(--dsw-static-neutral-bluish-00)')
    // Dark: one step below the modal's layer-2 tone, the sheet the embedded
    // IAM drawer paints.
    expect(paletteValue('body[data-ds-dark-theme]')).toBe('var(--dsw-static-neutral-bluish-900)')
  })

  it('is the token the harness drawer paints', () => {
    const drawerSheet = readFileSync(
      fileURLToPath(new URL('../../ui-primitives/src/Drawer.module.css', import.meta.url)),
      'utf8',
    )
    const panel = parseRules(drawerSheet).find(rule => rule.selectors.includes('.panel'))
    expect(panel === undefined ? undefined : value(panel, 'background')).toBe(`var(${ALIAS})`)
  })
})
