/**
 * Cascade containment for the stylesheets a fork host package inlines from an
 * external SDKWork application's entry sheet.
 *
 * Two collisions are contained here, and they need different tools.
 *
 * **The host document.** A standalone app's `src/index.css` is the *page*
 * sheet: `body { color: … }`, `html.dark body { … }`, `html, body, #root { … }`
 * assume the app owns the document. The hosts that embed one
 * (ui-sdkwork-appstore, -markets, -template-library, -demand-hall, -course,
 * -drive, -knowledge, -generations-*) inline that sheet into the harness
 * document, where it used to cascade over the shell defaults in
 * `packages/client/web/src/base.css` purely on document order. A cascade layer
 * fixes it: unlayered author styles beat layered ones, so the shell's own
 * `html`/`body`/`#root` defaults win regardless of tag order while every rule
 * the app ships still applies inside the surface.
 *
 * **The other embedded applications.** Each host compiles its own Tailwind v4
 * sheet from its own `@source` roots, and every sheet carries the base
 * utilities its own application happens to use — not the variants other
 * applications use. In one shared layer document order decides at equal
 * specificity, so a sheet injected later re-declares `.grid-cols-1` and beats
 * an earlier sheet's `@3xl:grid-cols-4`; the App Store AI-hub agent grid then
 * renders a single 1710px column inside a 1758px container. Which sheet is
 * last is load order — deterministic at boot, then re-arranged by every HMR
 * rebuild (`removeOwnedStyles` + re-import re-appends the tag) — so the grid
 * flipped between one and four columns with the build order. The App Store
 * sheet family therefore gets its own later layer
 * ({@link EMBEDDED_APPSTORE_CSS_LAYER}) *and* a scope: the later layer makes
 * its rules win inside its own surfaces over every earlier embedded sheet, and
 * the scope keeps them from matching any other mode's DOM.
 *
 * Moving a family's *whole* sheet into that later layer is not safe: it carries
 * Tailwind's preflight (`* { margin: 0; padding: 0; border: 0 }`) with it, and a
 * layer outranks the whole earlier layer including its `utilities`, so the
 * App Store preflight stripped padding, margins, and borders from every other
 * embedded application's pages (measured: another mode's `p-4` element computed
 * `padding: 0`). A family sheet is therefore split: theme, base, components, and
 * document rules stay in {@link EMBEDDED_APP_CSS_LAYER}, and only the
 * `@layer utilities` rules move into the family layer under the surface scope
 * ({@link EmbeddedAppStyleOptions.splitUtilities}).
 */

/**
 * Cascade layer holding every stylesheet a fork host package inlines from an
 * external SDKWork application's entry sheet.
 *
 * One name for all of them: they share a single cascade position below the
 * shell, and their order relative to each other stays the tag order.
 */
export const EMBEDDED_APP_CSS_LAYER = 'dsh-sdkwork-embedded-app'

/**
 * Late layer owned by the App Store sheet family's utility rules (appstore,
 * markets, template-library, demand-hall).
 *
 * These hosts all inline the same App Store application sheet, so they agree
 * with each other; the families that only carry their own application's
 * utilities are the ones that disagree. The later layer makes the App Store's
 * class rules win inside its own surfaces no matter which bundle loaded last,
 * without `!important` and without re-asserting individual utilities. Its
 * preflight and document rules must stay in {@link EMBEDDED_APP_CSS_LAYER} —
 * see {@link EmbeddedAppStyleOptions.splitUtilities}.
 */
export const EMBEDDED_APPSTORE_CSS_LAYER = 'dsh-sdkwork-appstore-embed'

/**
 * Canonical cascade-layer order for the harness document, restated by every
 * embedded application sheet so layer position does not depend on which sheet
 * the browser parses first.
 *
 * A layer's position is fixed the first time its name is *seen*, so "declare
 * the order in the shell sheet" is only a statement about whichever sheet wins
 * the race. Both sheets are injected from JavaScript here — `apps/web/src/main.ts`
 * imports the shell sheet, and every host package appends its own `<style>` at
 * factory-execution time — so that race is decided by module-evaluation order
 * and is not stable across loads.
 *
 * Losing it is not cosmetic: `utilities` would land after
 * {@link EMBEDDED_APP_CSS_LAYER}, and a later layer wins at equal specificity.
 * The shell's `.grid-cols-1` then outranks the embedded sheet's own
 * `@3xl:grid-cols-4`, so a container-query card grid pins to a single column
 * however wide its container is — and flips between one and four columns
 * whenever the race lands the other way (measured: identical DOM, identical
 * 900px container, 4 columns in one order and 1 column in the other).
 *
 * Must stay identical to the `@layer` statement in `apps/web/src/index.css`;
 * `scripts/client-bundle-css.spec.ts` reads that file and asserts the two agree.
 */
export const EMBEDDED_APP_LAYER_ORDER = [
  'properties',
  'theme',
  'base',
  'components',
  'utilities',
  EMBEDDED_APP_CSS_LAYER,
  EMBEDDED_APPSTORE_CSS_LAYER,
  'dsh-sdkwork-apikey-embed',
] as const

/** Places one embedded sheet in a cascade layer, optionally scoped to a surface. */
export interface EmbeddedAppStyleOptions {
  /**
   * Layer that positions the sheet. Defaults to
   * {@link EMBEDDED_APP_CSS_LAYER}; a sheet family that must outrank the other
   * embedded applications names its own layer from
   * {@link EMBEDDED_APP_LAYER_ORDER}.
   */
  layer?: string
  /**
   * Selector of the host surface root that owns this application's DOM. When
   * set, every utility rule only matches inside that subtree, so unrelated
   * applications cannot re-declare the same class names.
   */
  scope?: string
  /**
   * Move only the `@layer utilities` rules into `layer` (scoped) and leave the
   * sheet's theme, base, component, and document rules in the shared
   * {@link EMBEDDED_APP_CSS_LAYER}.
   *
   * Required for a family sheet that outranks the shared layer: moving the whole
   * sheet moves Tailwind's preflight (`* { margin: 0; padding: 0; border: 0 }`)
   * into the later layer, where it outranks every other embedded application's
   * utilities and strips their padding, margins, and borders document-wide
   * (measured: a `p-4` element in another mode computed `padding: 0` once the
   * family sheet moved later). Splitting keeps the preflight in `base`, below
   * every application's `utilities`, while the family's class rules still win
   * inside the surface they are scoped to.
   */
  splitUtilities?: boolean
}

/** Characters that make a stylesheet scanner skip instead of counting braces. */
const QUOTE = /['"]/

/**
 * Find the `{` matching the block that starts at `open`.
 * @param css - stylesheet text.
 * @param open - index of the opening brace.
 * @returns the index of the matching closing brace, or -1 when unbalanced.
 */
function matchingBrace(css: string, open: number): number {
  let depth = 0
  let quote: string | undefined
  for (let index = open; index < css.length; index += 1) {
    const char = css[index]!
    if (quote !== undefined) {
      if (char === '\\') index += 1
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '\\') {
      index += 1
      continue
    }
    if (QUOTE.test(char)) {
      quote = char
      continue
    }
    if (char === '/' && css[index + 1] === '*') {
      const commentEnd = css.indexOf('*/', index + 2)
      if (commentEnd < 0) return -1
      index = commentEnd + 1
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/**
 * Wrap the contents of every top-level `@layer utilities { … }` block in
 * `@scope (<selector>)`.
 *
 * Only `utilities` is scoped on purpose. Those are the class rules that collide
 * across applications; `theme` must keep declaring the Tailwind custom
 * properties (`--spacing`, `--container-*`, the color ramps) that the utilities
 * resolve, `base` carries the preflight reset those utilities assume, and the
 * application's own `:root`/`body` rules are already contained by the cascade
 * layer. Scoping the whole sheet would drop the theme variables unless the host
 * happened to declare the same theme — `ui-sdkwork-apikey` can afford that only
 * because the shell sheet declares the same Tailwind theme.
 * @param css - compiled stylesheet text.
 * @param scope - selector of the surface root that owns the application's DOM.
 * @returns the same sheet with scoped utility rules.
 */
export function scopeStyleSheetUtilities(css: string, scope: string): string {
  const marker = '@layer utilities'
  const wrapper = `@scope (${scope}){`
  let scoped = ''
  let cursor = 0
  for (;;) {
    const layerStart = css.indexOf(marker, cursor)
    if (layerStart < 0) return scoped + css.slice(cursor)
    let open = layerStart + marker.length
    while (open < css.length && /\s/.test(css[open]!)) open += 1
    if (css[open] !== '{') {
      // A statement form (`@layer utilities;`) carries no rules; copy it and
      // keep scanning so a later block form in the same sheet is still scoped.
      scoped += css.slice(cursor, open)
      cursor = open
      continue
    }
    const close = matchingBrace(css, open)
    if (close < 0) return scoped + css.slice(cursor)
    scoped += css.slice(cursor, open + 1) + wrapper + css.slice(open + 1, close) + '}'
    cursor = close
  }
}

/**
 * Split the compiled sheet into everything before/after its utility rules and
 * the concatenated contents of every top-level `@layer utilities { … }` block.
 * @param css - compiled stylesheet text.
 * @returns the sheet without its utilities blocks, plus those blocks' contents.
 */
function extractUtilities(css: string): { base: string; utilities: string } {
  const marker = '@layer utilities'
  let base = ''
  let utilities = ''
  let cursor = 0
  for (;;) {
    const layerStart = css.indexOf(marker, cursor)
    if (layerStart < 0) {
      base += css.slice(cursor)
      return { base, utilities }
    }
    let open = layerStart + marker.length
    while (open < css.length && /\s/.test(css[open]!)) open += 1
    if (css[open] !== '{') {
      // A statement form (`@layer utilities;`) carries no rules; keep it in the
      // base sheet and continue scanning for a later block form.
      base += css.slice(cursor, open)
      cursor = open
      continue
    }
    const close = matchingBrace(css, open)
    if (close < 0) {
      base += css.slice(cursor)
      return { base, utilities }
    }
    base += css.slice(cursor, layerStart)
    utilities += css.slice(open + 1, close)
    cursor = close + 1
  }
}

/**
 * Wrap an external application's stylesheet in its cascade layer.
 *
 * A standalone SDKWork app's `src/index.css` is written as the *page* sheet, so
 * it carries unlayered document-level rules (`body`, `html.dark body`,
 * `html, body, #root`) that assume the app owns the document; the hosts that
 * embed one inline that whole sheet into the harness document, where those
 * rules used to cascade over the shell defaults in
 * `packages/client/web/src/base.css`. The layer below the shell contains them
 * while every app rule still applies inside the surface. Custom properties are
 * unaffected: a layered `:root` still resolves for the app's own `var()`
 * references.
 *
 * The wrap happens after compile on purpose. Tailwind expands
 * `@import "tailwindcss"`, its theme and preflight blocks, and `@apply` during
 * compile, so only the compiled text is a complete sheet — and the app's own
 * `@layer` statements then nest inside this one, leaving its internal cascade
 * untouched. This containment assumes no document-level rule is marked
 * `!important`: inside one origin, importance beats layer order, so such a rule
 * would win again and has to be fixed at its source instead.
 *
 * The sheet also restates {@link EMBEDDED_APP_LAYER_ORDER} before wrapping.
 * Wrapping alone *names* the layer but does not *position* it: the browser
 * fixes a layer's position when the name is first seen, and both this sheet and
 * the shell's are injected from JavaScript, so naming it only here can place it
 * ahead of `utilities` — after which the shell's own utilities outrank the
 * whole embedded sheet. Restating the full order makes the sheet order-independent:
 * whichever sheet parses first establishes the same ordered list, and the
 * second one is a no-op.
 * @param css - compiled stylesheet text inlined into a plugin's client bundle.
 * @param options - layer and surface scope for the sheet (see
 * {@link EmbeddedAppStyleOptions}).
 * @returns the same sheet, layer-ordered and wrapped.
 */
export function embedAppStylesheetInLayer(
  css: string,
  options: EmbeddedAppStyleOptions = {},
): string {
  const { layer = EMBEDDED_APP_CSS_LAYER, scope, splitUtilities = false } = options
  const order = `@layer ${EMBEDDED_APP_LAYER_ORDER.join(', ')};`
  if (splitUtilities && scope !== undefined) {
    const { base, utilities } = extractUtilities(css)
    const baseBlock = `@layer ${EMBEDDED_APP_CSS_LAYER}{${base}}`
    const utilitiesBlock = utilities === '' ? '' : `@layer ${layer}{@scope (${scope}){${utilities}}}`
    return order + baseBlock + utilitiesBlock
  }
  const contained = scope === undefined ? css : scopeStyleSheetUtilities(css, scope)
  return `${order}@layer ${layer}{${contained}}`
}
