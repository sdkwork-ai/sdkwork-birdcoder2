/** Rail entry style contract: the active entry keeps the neutral selection
 * cell and paints its filled glyph in the brand tech-blue ink; idle hover
 * keeps the neutral tint. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/RailEntry.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('RailEntry.module.css', () => {
  it('keeps the neutral selection cell and paints the active glyph in the brand tech-blue ink', () => {
    expect(declarations('.entry.active')?.get('background'))
      .toBe('var(--dsw-alias-interactive-bg-active)')
    expect(declarations('.entry.active')?.get('color'))
      .toBe('var(--dsw-alias-brand-primary-new-colorprimary-new-color)')
  })

  it('keeps the neutral hover tint off the active cell', () => {
    expect(declarations('.entry:hover:not(.active)')?.get('background'))
      .toBe('var(--dsw-alias-interactive-bg-hover)')
  })
})
