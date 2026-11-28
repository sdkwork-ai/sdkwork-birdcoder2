/**
 * The Connectors tab's host-theme projection into the embedded connector panel.
 *
 * The panel is another document (the first-party SDKWork MCP connector plugin
 * under `plugins/`, mounted by the web bundle and framed here), so it does not
 * inherit the application's stylesheet. Its own stylesheet is token-first: every
 * surface, ink, accent, radius and elevation reads a `--dsw-*` alias with a
 * standalone fallback, and this module is what supplies those tokens when the
 * page is framed by the application.
 *
 * Two facts are projected:
 *
 * - **The resolved color scheme.** The panel's fallbacks use `light-dark()`, and
 *   it declares `color-scheme: light dark`; inside the frame the application's
 *   resolved theme decides, not the OS (`color-scheme` is set on the frame root).
 * - **The host token values.** The alias values are read from the host document's
 *   computed style, so an OEM theme, a light/dark switch and a future token change
 *   all reach the panel without a second palette here.
 *
 * The accent family (`--accent`, `--accent-hover`, `--accent-light`) stays an
 * explicit part of the contract: the bundle acceptance spec pins those three
 * names in the shipped page, and they are also what a host without the business
 * tokens falls back to.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/connectorTheme
 */

/** Id of the style element this module owns inside the panel document. */
export const CONNECTOR_THEME_STYLE_ID = 'dsh-connector-host-theme'

/**
 * The panel's accent variables, in the order the injected sheet declares them.
 * They are the panel's names, not ours; the bundle acceptance spec pins them.
 */
export const CONNECTOR_THEME_VARIABLES = ['--accent', '--accent-hover', '--accent-light'] as const

/**
 * The `--dsw-*` aliases the panel's stylesheet consumes. Reading them from the
 * host document (rather than restating values) is what keeps the framed panel on
 * the application's palette, radii and elevation.
 */
export const CONNECTOR_THEME_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-card-fill',
  '--dsw-alias-card-fill-hover',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-brand-primary',
  '--dsw-alias-brand-text',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-business-tertiary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-success-tertiary',
  '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-warn-tertiary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-bg-mask-1',
  '--dsw-alias-scrollbar-bg-l2',
  '--dsw-alias-scrollbar-hover-l2',
  '--dsw-radius-xs',
  '--dsw-radius-sm',
  '--dsw-radius-md',
  '--dsw-radius-lg',
  '--dsw-radius-xl',
  '--dsw-radius-panel',
  '--dsw-elevation-prominent',
  '--dsw-font-family',
  '--dsw-focus-ring-width',
] as const

/**
 * Brand ramp steps, matching `ui-theme`'s static DeepSeek ramp. They are the
 * fallbacks for a host that declares no ramp, so the panel keeps a stable accent
 * instead of falling back to its own indigo.
 */
const FALLBACK_BRAND_BASE = '#4176e6'
const FALLBACK_BRAND_HOVER_LIGHT = '#4868b2'
const FALLBACK_BRAND_HOVER_DARK = '#7aaaff'

/** Cover of the panel's accent family, resolved against the host theme. */
export interface ConnectorBrandTokens {
  /** Fill of an accent button, chip or selected tab. */
  readonly base: string
  /** Hover on a light panel: one step deeper than the fill. */
  readonly hoverOnLight: string
  /** Hover on a dark panel: one step lighter than the fill. */
  readonly hoverOnDark: string
}

/** The resolved theme the frame is drawn with. */
export interface ConnectorTheme {
  /** The application's resolved light/dark scheme. */
  readonly scheme: 'light' | 'dark'
  /** The brand ramp the accent family is derived from. */
  readonly brand: ConnectorBrandTokens
  /** Host `--dsw-*` values, empty when the host declares none. */
  readonly tokens: Readonly<Record<string, string>>
}

/** The host document face this module reads tokens through. */
export interface ConnectorThemeHost {
  /** The application document whose root carries the theme tokens. */
  readonly document: { readonly body: HTMLElement | null }
  /** Computed style reader of the host window. */
  getComputedStyle(element: Element): Pick<CSSStyleDeclaration, 'getPropertyValue'>
}

/**
 * Read one theme token off the host document.
 * @param host - the host window face.
 * @param name - the custom property name.
 * @returns its computed value, or an empty string when the host declares none.
 */
function token(host: ConnectorThemeHost, name: string): string {
  const body = host.document.body
  if (body === null) return ''
  return host.getComputedStyle(body).getPropertyValue(name).trim()
}

/**
 * Resolve the host brand ramp into the panel's accent family.
 * @param host - the host window face, usually `globalThis` in the browser.
 * @returns the three accent values, host tokens first and ramp defaults second.
 */
export function readConnectorBrandTokens(host: ConnectorThemeHost): ConnectorBrandTokens {
  return {
    base: token(host, '--dsw-alias-state-business-primary')
      || token(host, '--dsw-alias-brand-primary')
      || token(host, '--dsw-static-deepseek-500')
      || FALLBACK_BRAND_BASE,
    hoverOnLight: token(host, '--dsw-static-deepseek-600') || FALLBACK_BRAND_HOVER_LIGHT,
    hoverOnDark: token(host, '--dsw-static-deepseek-400') || FALLBACK_BRAND_HOVER_DARK,
  }
}

/**
 * Read the whole host theme the frame is drawn with.
 * @param host - the host window face, usually `globalThis` in the browser.
 * @param scheme - the application's resolved color scheme.
 * @returns the scheme, brand ramp and every alias the panel consumes.
 */
export function readConnectorTheme(host: ConnectorThemeHost, scheme: 'light' | 'dark'): ConnectorTheme {
  const tokens: Record<string, string> = {}
  for (const name of CONNECTOR_THEME_TOKENS) {
    const value = token(host, name)
    if (value !== '') tokens[name] = value
  }
  return { scheme, brand: readConnectorBrandTokens(host), tokens }
}

/**
 * The stylesheet that re-points the panel's tokens at the host theme.
 *
 * `--accent-light` is the host's brand tint when it declares one; otherwise it is
 * mixed against the host base so the tinted fill follows whichever mode the
 * application draws.
 * @param theme - the resolved theme.
 * @returns the stylesheet text for the panel document.
 */
export function connectorThemeCss(theme: ConnectorTheme): string {
  const { scheme, brand, tokens } = theme
  const lines = [
    ':root {',
    `  color-scheme: ${scheme};`,
    `  --accent: ${brand.base};`,
    `  --accent-hover: ${scheme === 'dark' ? brand.hoverOnDark : brand.hoverOnLight};`,
    `  --accent-light: ${tokens['--dsw-alias-state-business-tertiary'] ?? `color-mix(in oklab, ${brand.base} 12%, var(--dsw-alias-bg-base, var(--card)))`};`,
  ]
  for (const [name, value] of Object.entries(tokens)) lines.push(`  ${name}: ${value};`)
  lines.push('}')
  return lines.join('\n')
}

/**
 * Apply the host theme to a mounted connector panel.
 *
 * Idempotent: the style element is created once and rewritten on a later load or
 * theme change, so a panel that reloads itself does not collect copies. A frame
 * without a readable document (a panel that never loaded, or a browser that
 * blocks it) is left alone rather than failing the tab.
 * @param frame - the connector iframe, or null while it is not drawn.
 * @param theme - the resolved host theme.
 */
export function applyConnectorTheme(
  frame: Pick<HTMLIFrameElement, 'contentDocument'> | null,
  theme: ConnectorTheme,
): void {
  const doc = frame?.contentDocument
  if (doc === null || doc === undefined) return
  const parent = doc.head ?? doc.documentElement
  /* v8 ignore next -- a loaded page always has a document element; a blank frame document that has neither is not a page to theme. */
  if (parent === null) return
  const existing = doc.getElementById(CONNECTOR_THEME_STYLE_ID)
  const style = existing ?? doc.createElement('style')
  if (existing === null) {
    style.id = CONNECTOR_THEME_STYLE_ID
    parent.append(style)
  }
  style.textContent = connectorThemeCss(theme)
}
