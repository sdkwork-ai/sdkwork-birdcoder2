/** DeployDialogs.module.css theme contract: the dialogs mount under
 * document.body, so host-scoped variables never reach them — every token a
 * rule reads must be redefined by the dark block that the dialog roots'
 * `data-theme="dark"` activates, or dark hosts fall back to the light values. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/DeployDialogs.module.css', import.meta.url)), 'utf8')

/** Theme-invariant tokens: identical fallback in both schemes. */
const THEME_INVARIANT = new Set(['--pda-brand'])

/**
 * Custom properties declared by one exact selector.
 * @param selector - exact selector text.
 * @returns the declared custom-property names, or undefined when absent.
 */
function declaredCustomProperties(selector: string): Set<string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Set<string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      const property = part.slice(0, colon).trim()
      if (property.startsWith('--')) found.add(property)
    }
    return found
  }
  return undefined
}

describe('DeployDialogs.module.css', () => {
  it('redefines every themed token in the dark block the dialog roots activate', () => {
    const dark = declaredCustomProperties(".overlay[data-theme='dark']")
    expect(dark).toBeDefined()
    const referenced = new Set(
      [...css.matchAll(/var\((--pda-[\w-]+)/g)].map(match => match[1]),
    )
    const uncovered = [...referenced].filter(name => !THEME_INVARIANT.has(name) && !dark?.has(name))
    expect(uncovered).toEqual([])
  })

  it('keeps the dark block on the overlay root so portaled descendants inherit it', () => {
    // The overlay is the dialog tree's root: variables declared there reach
    // every row, input, and button without a second declaration site.
    expect(css.includes(".overlay[data-theme='dark']")).toBe(true)
  })
})
