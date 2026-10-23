/** DeployPublishAction stylesheet contract: the trigger is the only surface
 * this sheet styles. The menu itself renders through the shared ui-primitives
 * Menu (portal, outside-click dismissal, viewport placement), so a local
 * hover-menu rule would be a second, divergent menu implementation. */
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
  it('keeps the header trigger aligned and sized like its sibling utilities', () => {
    expect(declarations('.root')?.get('display')).toBe('inline-flex')
    expect(declarations('.trigger')?.get('display')).toBe('inline-flex')
    expect(declarations('.trigger')?.get('width')).toBe('28px')
    expect(declarations('.trigger')?.get('height')).toBe('28px')
  })

  it('owns no local dropdown implementation', () => {
    expect(declarations('.menu')).toBeUndefined()
    expect(declarations('.menu::before')).toBeUndefined()
    expect(css).not.toContain('.root:hover')
  })
})
