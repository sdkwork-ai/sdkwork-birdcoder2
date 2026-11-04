/**
 * Brand lockup of the framework-free boot page: the product mark above the
 * product name.
 *
 * FORK-OWNED FILE: the boot page itself is upstream-owned and every upstream
 * merge has reverted at least one brand surface, so the fork renders its
 * identity from here (AGENTS.md, "BirdCoder brand assets"). A sync can change
 * how the boot page composes this lockup, but it cannot put the upstream name
 * back on the startup surface.
 * @module @deepseek-ai/dsh-client-web/src/boot-brand
 */
import css from './boot-brand.module.css'

/**
 * Product name the startup surface spells; display copy only, never an identifier.
 *
 * It matches the static document title (`apps/web/index.html`). An OEM profile's
 * display name is applied by client plugins, which have not loaded yet when this
 * page paints, so a rebranded deployment keeps this shipped name on the startup
 * surface for the same interval as its document title.
 */
const PRODUCT_NAME = 'BirdCoder'

/**
 * Mark raster served from the web root: the fork's canonical raster
 * (`apps/web/public/favicon.png`), never a second copy of the artwork, and the
 * same URL the document already requests for its favicon.
 */
const LOGO_URL = '/favicon.png'

/** Rendered mark edge in CSS pixels; the raster is square, so both axes share it. */
const LOGO_SIZE = 72

/**
 * Build the startup lockup: the product mark above the product name.
 *
 * The mark is decorative (`alt=""`) so each screen reads one product name
 * instead of a redundant description of the artwork, and a mark that fails to
 * load removes itself rather than leaving a broken-image glyph on the one page
 * that must always look intentional.
 * @returns the lockup element the boot page keeps through every state.
 */
export function createBootBrand(): HTMLDivElement {
  const brand = document.createElement('div')
  brand.className = css.brand

  const mark = document.createElement('img')
  mark.className = css.mark
  mark.src = LOGO_URL
  // Attributes reserve both axes before the stylesheet arrives, so an icon that
  // lands a frame late cannot shift the name and spinner below it.
  mark.width = LOGO_SIZE
  mark.height = LOGO_SIZE
  mark.alt = ''
  mark.decoding = 'async'
  mark.setAttribute('aria-hidden', 'true')
  mark.dataset.dshBootLogo = ''
  mark.addEventListener('error', () => { mark.hidden = true })

  const name = document.createElement('div')
  name.className = css.name
  name.textContent = PRODUCT_NAME

  brand.append(mark, name)
  return brand
}
