// @vitest-environment jsdom
/**
 * connectorTheme: the host theme projected into the embedded connector panel.
 *
 * The panel is a separate document, so it inherits neither this page's
 * stylesheet nor its color scheme. These cases pin the three pieces of the
 * projection: the token read (host aliases and brand ramp first, standalone
 * fallbacks when the host declares none), the generated sheet (the resolved
 * scheme, the accent family, every forwarded alias), and the apply step (one
 * owned style element, rewritten on a later load or scheme change, no frame left
 * to fail).
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  CONNECTOR_THEME_STYLE_ID,
  CONNECTOR_THEME_TOKENS,
  CONNECTOR_THEME_VARIABLES,
  applyConnectorTheme,
  connectorThemeCss,
  readConnectorBrandTokens,
  readConnectorTheme,
  type ConnectorBrandTokens,
  type ConnectorTheme,
  type ConnectorThemeHost,
} from '../src/client/connectorTheme.ts'

afterEach(() => {
  document.getElementById(CONNECTOR_THEME_STYLE_ID)?.remove()
})

/** The resolved brand used by the sheet assertions. */
const brand: ConnectorBrandTokens = {
  base: 'rgb(65, 118, 230)',
  hoverOnLight: 'rgb(72, 104, 178)',
  hoverOnDark: 'rgb(122, 170, 255)',
}

/** A resolved light theme without any host aliases. */
const lightTheme: ConnectorTheme = { scheme: 'light', brand, tokens: {} }

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
  it('projects the host brand and static ramp when the host declares them', () => {
    const read = readConnectorBrandTokens(host({
      '--dsw-alias-brand-primary': 'rgb(65, 118, 230)',
      '--dsw-static-deepseek-600': 'rgb(72, 104, 178)',
      '--dsw-static-deepseek-400': 'rgb(122, 170, 255)',
    }))
    expect(read).toEqual(brand)
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

describe('readConnectorTheme', () => {
  it('forwards every host alias the panel consumes and keeps the scheme', () => {
    const values = Object.fromEntries(CONNECTOR_THEME_TOKENS.map(name => [name, `value${name}`]))
    const theme = readConnectorTheme(host(values), 'dark')
    expect(theme.scheme).toBe('dark')
    expect(Object.keys(theme.tokens)).toHaveLength(CONNECTOR_THEME_TOKENS.length)
    for (const name of CONNECTOR_THEME_TOKENS) expect(theme.tokens[name]).toBe(`value${name}`)
  })

  it('omits aliases the host leaves undeclared so the panel fallbacks apply', () => {
    const theme = readConnectorTheme(host({ '--dsw-alias-bg-base': 'rgb(1, 2, 3)' }), 'light')
    expect(theme.tokens).toEqual({ '--dsw-alias-bg-base': 'rgb(1, 2, 3)' })
  })
})

describe('connectorThemeCss', () => {
  it('declares the resolved scheme and the panel accent family', () => {
    const css = connectorThemeCss(lightTheme)
    expect(css).toContain('color-scheme: light;')
    for (const variable of CONNECTOR_THEME_VARIABLES) {
      expect(css).toContain(`${variable}:`)
    }
    expect(css).toContain(`--accent: ${brand.base};`)
    expect(css).toContain(`--accent-hover: ${brand.hoverOnLight};`)
  })

  it('uses the dark hover step when the application draws dark', () => {
    const css = connectorThemeCss({ ...lightTheme, scheme: 'dark' })
    expect(css).toContain('color-scheme: dark;')
    expect(css).toContain(`--accent-hover: ${brand.hoverOnDark};`)
  })

  it('mixes the tinted fill against the host base when the host has no brand tint', () => {
    const css = connectorThemeCss(lightTheme)
    expect(css).toContain(`color-mix(in oklab, ${brand.base} 12%, var(--dsw-alias-bg-base, var(--card)))`)
  })

  it('takes the tinted fill from the host brand tint when it declares one', () => {
    const css = connectorThemeCss({
      ...lightTheme,
      tokens: { '--dsw-alias-state-business-tertiary': 'rgb(237, 243, 254)' },
    })
    expect(css).toContain('--accent-light: rgb(237, 243, 254);')
    expect(css).toContain('--dsw-alias-state-business-tertiary: rgb(237, 243, 254);')
  })

  it('forwards the host aliases verbatim, so a themed deployment repaints the panel', () => {
    const css = connectorThemeCss({
      ...lightTheme,
      tokens: { '--dsw-alias-card-fill': 'rgb(20, 22, 26)', '--dsw-radius-xl': '20px' },
    })
    expect(css).toContain('--dsw-alias-card-fill: rgb(20, 22, 26);')
    expect(css).toContain('--dsw-radius-xl: 20px;')
  })
})

describe('applyConnectorTheme', () => {
  it('owns one style element in the panel document', () => {
    applyConnectorTheme({ contentDocument: document }, lightTheme)
    applyConnectorTheme({ contentDocument: document }, lightTheme)
    const styles = document.querySelectorAll(`#${CONNECTOR_THEME_STYLE_ID}`)
    expect(styles).toHaveLength(1)
    expect(styles[0].textContent).toBe(connectorThemeCss(lightTheme))
  })

  it('rewrites the owned element on a later load instead of stacking sheets', () => {
    applyConnectorTheme({ contentDocument: document }, lightTheme)
    applyConnectorTheme({ contentDocument: document }, {
      ...lightTheme,
      brand: { ...brand, base: 'rgb(9, 9, 9)' },
    })
    expect(document.querySelectorAll(`#${CONNECTOR_THEME_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(CONNECTOR_THEME_STYLE_ID)?.textContent)
      .toContain('--accent: rgb(9, 9, 9);')
  })

  it('repaints in place when the application scheme changes', () => {
    applyConnectorTheme({ contentDocument: document }, lightTheme)
    applyConnectorTheme({ contentDocument: document }, { ...lightTheme, scheme: 'dark' })
    expect(document.querySelectorAll(`#${CONNECTOR_THEME_STYLE_ID}`)).toHaveLength(1)
    expect(document.getElementById(CONNECTOR_THEME_STYLE_ID)?.textContent)
      .toContain('color-scheme: dark;')
  })

  it('leaves a frame with no readable document alone', () => {
    expect(() => { applyConnectorTheme(null, lightTheme) }).not.toThrow()
    expect(() => { applyConnectorTheme({ contentDocument: null }, lightTheme) }).not.toThrow()
    expect(document.getElementById(CONNECTOR_THEME_STYLE_ID)).toBeNull()
  })
})
