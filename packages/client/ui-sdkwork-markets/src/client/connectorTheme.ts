/**
 * The Connectors tab's host-theme projection into the embedded connector panel.
 *
 * The panel is another package's page (`dsh-mcp-connector`, linked as a
 * submodule and mounted by the web bundle), served same-origin and framed by
 * this page. Its palette is the panel's own: an indigo accent family declared on
 * its document root as `--accent`, `--accent-hover` and `--accent-light`, which
 * every button, chip, tab and badge inside the frame reads. Framed next to the
 * application's own chrome that indigo is the one surface that does not paint
 * the host brand.
 *
 * The plugin ships its built page and this repository does not edit it, so the
 * frame's owner is the only place that can align it: this module appends one
 * style element to the panel document that re-points those three variables at
 * the host brand ramp — the same static DeepSeek steps the SDKWork store
 * surfaces project in `sdkwork-appstore`'s shell. The hover step follows
 * `THEME_DARKMODE_SPEC`: step 600 on a light panel, step 400 on a dark one, so
 * the injected media query mirrors the panel's own `prefers-color-scheme` rule
 * (its scheme, not this page's — a frame is themed by what it actually draws).
 *
 * Only the accent family is projected. Status colours (`--ok`/`--warn`/`--bad`),
 * neutral surfaces and ink stay the panel's own: they already carry the
 * application's semantic roles, and rewriting them would claim a wider contract
 * than the tab needs.
 *
 * The three variable names are a soft contract with the shipped artifact, like
 * the panel key and the frame protocol: `packages/bundle/web-app/tests/
 * built-in-mcp-connector.spec.ts` reads `ui/index.html` and fails when an
 * upstream rename drops one, so the panel can never go quietly indigo again.
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
    base: token(host, '--dsw-static-deepseek-500') || FALLBACK_BRAND_BASE,
    hoverOnLight: token(host, '--dsw-static-deepseek-600') || FALLBACK_BRAND_HOVER_LIGHT,
    hoverOnDark: token(host, '--dsw-static-deepseek-400') || FALLBACK_BRAND_HOVER_DARK,
  }
}

/**
 * The stylesheet that re-points the panel's accent family at the host brand.
 *
 * `--accent-light` is mixed against the panel's own `--card` so the tinted fill
 * follows whichever mode the panel draws, instead of baking one mode's surface
 * into the token.
 * @param tokens - the resolved brand values.
 * @returns the stylesheet text for the panel document.
 */
export function connectorThemeCss(tokens: ConnectorBrandTokens): string {
  return [
    ':root {',
    `  --accent: ${tokens.base};`,
    `  --accent-hover: ${tokens.hoverOnLight};`,
    `  --accent-light: color-mix(in oklab, ${tokens.base} 12%, var(--card));`,
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    `    --accent-hover: ${tokens.hoverOnDark};`,
    `    --accent-light: color-mix(in oklab, ${tokens.base} 18%, var(--card));`,
    '  }',
    '}',
  ].join('\n')
}

/**
 * Apply the host theme to a mounted connector panel.
 *
 * Idempotent: the style element is created once and rewritten on a later load,
 * so a panel that reloads itself does not collect copies. A frame without a
 * readable document (a panel that never loaded, or a browser that blocks it) is
 * left alone rather than failing the tab.
 * @param frame - the connector iframe, or null while it is not drawn.
 * @param tokens - the resolved brand values.
 */
export function applyConnectorTheme(
  frame: Pick<HTMLIFrameElement, 'contentDocument'> | null,
  tokens: ConnectorBrandTokens,
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
  style.textContent = connectorThemeCss(tokens)
}
