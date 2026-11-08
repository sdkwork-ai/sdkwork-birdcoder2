// @vitest-environment jsdom
/**
 * connectorTheme: the host brand projected into the embedded connector panel.
 *
 * The panel is the `dsh-mcp-connector` package's own page with its own indigo
 * accent family, and this repository does not edit that package. These cases
 * pin the three pieces of the projection: the token read (host values first,
 * ramp defaults when the host declares none), the generated sheet (both scheme
 * branches, the tint mixed against the panel's own card), and the apply step
 * (one owned style element, rewritten on a later load, no frame left to fail).
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONNECTOR_THEME_STYLE_ID,
  CONNECTOR_THEME_VARIABLES,
  applyConnectorTheme,
  connectorThemeCss,
  readConnectorBrandTokens,
  type ConnectorBrandTokens,
  type ConnectorThemeHost,
} from '../src/client/connectorTheme.ts'

afterEach(() => {
  document.getElementById(CONNECTOR_THEME_STYLE_ID)?.remove()
})

/** The resolved brand used by the sheet assertions. */
const tokens: ConnectorBrandTokens = {
  base: 'rgb(65, 118, 230)',
  hoverOnLight: 'rgb(72, 104, 178)',
  hoverOnDark: 'rgb(122, 170, 255)',
}

/**
 * A host document face whose computed tokens are the given map.
 * @param values - custom property values the host declares.
 * @returns a host face over the real document body.
 */
function host(values: Record<string, string> = {}): ConnectorThemeHost {
  return {
    document: { body: document.body },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => values[name] ?? '' }),
  }
}

describe('readConnectorBrandTokens', () => {
  it('projects the host static ramp when the host declares it', () => {
    const read = readConnectorBrandTokens(host({
      '--dsw-static-deepseek-500': 'rgb(65, 118, 230)',
      '--dsw-static-deepseek-600': 'rgb(72, 104, 178)',
      '--dsw-static-deepseek-400': 'rgb(122, 170, 255)',
    }))
    expect(read).toEqual(tokens)
  })

  it('falls back to the ramp defaults when the host declares no ramp', () => {
    expect(readConnectorBrandTokens(host())).toEqual({
      base: '#4176e6',
      hoverOnLight: '#4868b2',
      hoverOnDark: '#7aaaff',
    })
  })

  it('falls back without a document body to read tokens off', () => {
    const detached: ConnectorThemeHost = {
      document: { body: null },
      getComputedStyle: () => ({ getPropertyValue: () => 'rgb(1, 2, 3)' }),
    }
    expect(readConnectorBrandTokens(detached).base).toBe('#4176e6')
  })
})

describe('connectorThemeCss', () => {
  it('covers the panel accent family and both hover steps', () => {
    const css = connectorThemeCss(tokens)
    for (const variable of CONNECTOR_THEME_VARIABLES) {
      expect(css).toContain(`${variable}:`)
    }
    expect(css).toContain(`--accent: ${tokens.base};`)
    expect(css).toContain(`--accent-hover: ${tokens.hoverOnLight};`)
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain(`--accent-hover: ${tokens.hoverOnDark};`)
  })

  it('mixes the tinted fill against the panel card so it follows the panel mode', () => {
    const css = connectorThemeCss(tokens)
    expect(css).toContain(`color-mix(in oklab, ${tokens.base} 12%, var(--card))`)
    expect(css).toContain(`color-mix(in oklab, ${tokens.base} 18%, var(--card))`)
  })
})

describe('applyConnectorTheme', () => {
  it('owns one style element in the panel document', () => {
    applyConnectorTheme({ contentDocument: document }, tokens)
    applyConnectorTheme({ contentDocument: document }, tokens)
    const styles = document.querySelectorAll(`#${CONNECTOR_THEME_STYLE_ID}`)
    expect(styles).toHaveLength(1)
    expect(styles[0].textContent).toBe(connectorThemeCss(tokens))
  })

  it('rewrites the owned element on a later load instead of stacking sheets', () => {
    applyConnectorTheme({ contentDocument: document }, tokens)
    applyConnectorTheme({ contentDocument: document }, { ...tokens, base: 'rgb(9, 9, 9)' })
    expect(document.querySelectorAll(`#${CONNECTOR_THEME_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(CONNECTOR_THEME_STYLE_ID)?.textContent)
      .toContain('--accent: rgb(9, 9, 9);')
  })

  it('leaves a frame with no readable document alone', () => {
    expect(() => { applyConnectorTheme(null, tokens) }).not.toThrow()
    expect(() => { applyConnectorTheme({ contentDocument: null }, tokens) }).not.toThrow()
    expect(document.getElementById(CONNECTOR_THEME_STYLE_ID)).toBeNull()
  })
})
