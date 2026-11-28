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
    expect(tracks.map(track => track.replace(/\u00a0/g, ' '))).toEqual([
      '${MODE_RAIL_WIDTH}px',
      '${sidebarVisible ? cols.sidebar : 0}px',
      'minmax(${cols.rightbar === 0 ? 0 : CENTER_MIN}px, 1fr)',
      'minmax(0px, ${rightbarMax}px)',
    ])
})

describe('AppFrame.module.css macOS window strip', () => {
  // The rail track owns the window's top-left corner, where hiddenInset draws
  // the traffic lights (16, 18 → 68, 30). Reserving the frame's constant top
  // step keeps the first mode cell below them instead of under them; the step
  // is padding so the occupant's `height: 100%` still measures the track.
  it('reserves the top step above the rail occupant on darwin only', () => {
    const rail = declarations(css, ":global([data-platform='darwin']) .railCol")
    expect(rail?.get('padding-top')).toBe('var(--dsh-frame-top-clearance, 0px)')
    expect(rail?.get('box-sizing')).toBe('border-box')
    // Windows already starts the rail below its caption through the frame's
    // padding, and a plain browser has no native chrome to clear.
    expect(declarations(css, '.railCol')?.get('padding-top')).toBeUndefined()

  it('lays the drag strip over the reserved band instead of in flow', () => {
    const strip = declarations(css, '.railWindowStrip')
    expect(strip?.get('position')).toBe('absolute')
    expect(strip?.get('height')).toBe('var(--dsh-frame-top-clearance, 0px)')
/** macOS sidebar column material in windowed and fullscreen states. */

  .replace(/\/\*[\s\S]*?\*\//g, ' ')
const column = ":global([data-platform='darwin']) .frame:not([data-sidebar-drawer]) .sidebarCol"
const fullscreen = ":global([data-platform='darwin'][data-fullscreen]) .frame:not([data-sidebar-drawer]) .sidebarCol"
const fillLayer = 'linear-gradient(var(--dsh-sidebar-fullscreen-fill), var(--dsh-sidebar-fullscreen-fill))'

 * Read the first rule for an exact selector, independently of CSS-module names.
 * @param selector - Selector whose declarations are inspected.
 * @param declaration - Optional declaration fragment for selectors with multiple rules.
 * @returns Whitespace-normalized declarations, or undefined when absent.
function rule(selector: string, declaration = ''): string | undefined {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selectors = '', body = '']) => [selectors, body.trim().replace(/\s+/g, ' ')] as const)
    .find(([selectors, body]) => body.includes(declaration) && selectors.split(',').some(value => value.trim() === selector))?.[1]

 * The body of every block of one at-rule.
 * @param prelude - The at-rule text before its block.
 * @returns The concatenated block bodies.
function atRule(prelude: string): string {
  return [...css.matchAll(new RegExp(`${prelude.replace(/[()]/g, '\\$&')} \\{([\\s\\S]*?)\\n\\}`, 'gu'))].map(([, body]) => body).join(' ')

describe('AppFrame.module.css', () => {
  it('paints a transparent fill layer over the glass outside fullscreen and the Web sidebar fill inside it', () => {
    const material = rule(column, 'background:')
    expect(material).toContain('--dsh-sidebar-fullscreen-fill: transparent;')
    expect(material).toContain(`background: ${fillLayer}, linear-gradient(`)
    expect(material).toContain('var(--dsw-specific-sidebar-tint);')
    expect(rule(fullscreen)).toBe('--dsh-sidebar-fullscreen-fill: var(--dsw-specific-sidebar-fill);')
    expect(rule('.sidebarCol')).toContain('background: var(--dsw-specific-sidebar-fill);')

  it('transitions the registered fill color without positioning the column', () => {
    expect(rule('@property --dsh-sidebar-fullscreen-fill')).toBe("syntax: '<color>'; inherits: false; initial-value: transparent;")
    expect(material).toContain('transition: --dsh-sidebar-fullscreen-fill var(--ds-transition-duration) var(--ds-ease-in-out);')
    expect(material).not.toMatch(/position|isolation|z-index/u)
    expect(css).not.toContain('.sidebarCol::before')

  it('keeps the fill layer over the reduced-transparency backing', () => {
    const reduced = atRule('@media (prefers-reduced-transparency: reduce)')
    expect(reduced).toContain(column)
    expect(reduced.replace(/\s+/g, ' ')).toContain(`background: ${fillLayer}, color-mix(in srgb, var(--dsw-specific-sidebar-fill) 90%, transparent);`)

  it('switches the fill immediately when reduced motion is requested', () => {
    expect(atRule('@media (prefers-reduced-motion: reduce)').replace(/\s+/g, ' ')).toContain(`${column} { transition: none; }`)
  })
})
