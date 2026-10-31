/** Frame grid placement: the fork's four tracks (rail, sidebar, center, rightbar). */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')
const tsx = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.tsx', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param source - stylesheet text.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(source: string, selector: string): Map<string, string> | undefined {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, ' ')
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

describe('AppFrame.module.css grid placement', () => {
  // The inline `grid-template-columns` is `rail | sidebar | center | rightbar`,
  // one track more than upstream's `sidebar | center | rightbar`. Upstream
  // numbers the columns explicitly, and an upstream merge that lands those
  // numbers unshifted collapses the frame: the sidebar sits on the rail's 56px
  // track, the conversation squeezes into the sidebar track and the right
  // column parks in the centre track.
  it('leaves track 1 to the mode rail and numbers the columns after it', () => {
    expect(declarations(css, '.railCol')?.get('grid-column')).toBe('1')
    expect(declarations(css, '.sidebarCol')?.get('grid-column')).toBe('2')
    expect(declarations(css, '.centerCol')?.get('grid-column')).toBe('3')
    expect(declarations(css, '.rightbarCol')?.get('grid-column')).toBe('4')
  })

  it('declares as many tracks inline as the columns it places', () => {
    const template = tsx.match(/gridTemplateColumns:\s*\n?\s*`([^`]+)`/)?.[1] ?? ''
    // Spaces inside ${...} are not track separators: mask them, then split on
    // the spaces that sit at parenthesis depth 0.
    const masked = template.replace(/\$\{[^}]*\}/g, match => match.replace(/\s+/g, '\u00a0'))
    const tracks: string[] = ['']
    let depth = 0
    for (const char of masked.trim()) {
      if (char === '(') depth += 1
      else if (char === ')') depth -= 1
      if (char === ' ' && depth === 0) tracks.push('')
      else tracks[tracks.length - 1] += char
    }
    expect(tracks.map(track => track.replace(/\u00a0/g, ' '))).toEqual([
      '${MODE_RAIL_WIDTH}px',
      '${sidebarVisible ? cols.sidebar : 0}px',
      'minmax(${cols.rightbar === 0 ? 0 : CENTER_MIN}px, 1fr)',
      'minmax(0px, ${rightbarMax}px)',
    ])
  })
})
