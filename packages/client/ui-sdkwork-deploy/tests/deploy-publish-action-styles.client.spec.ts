/** DeployPublishAction menu style contract: the hover dropdown keeps a
 * hit-test strip across the 6px gap between the trigger and the menu, so
 * pointer travel from the trigger into the menu cannot leave `.root:hover`
 * and close the menu. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/DeployPublishAction.module.css', import.meta.url)), 'utf8')

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

describe('DeployPublishAction.module.css', () => {
  it('keeps the menu offset by the documented 6px hover gap below the trigger', () => {
    expect(declarations('.menu')?.get('top')).toBe('calc(100% + 6px)')
  })

  it('bridges the hover gap while displayed so pointer travel cannot close the menu', () => {
    const bridge = declarations('.menu::before')
    expect(bridge?.get('content')).toBe("''")
    expect(bridge?.get('position')).toBe('absolute')
    expect(bridge?.get('top')).toBe('-7px')
    expect(bridge?.get('height')).toBe('7px')
    expect(bridge?.get('left')).toBe('0')
    expect(bridge?.get('right')).toBe('0')
  })
})
