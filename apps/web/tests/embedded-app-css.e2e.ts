/**
 * Embedded-application cascade contract, measured in a real browser.
 *
 * The App Store sheet family splits into two placements: its theme, preflight,
 * and document rules stay in the shared embedded layer, while its utility rules
 * move into a late layer scoped to the mode surface. That combination keeps the
 * App Store's responsive grid winning inside its own pages without letting the
 * family's preflight or document rules reset another application's utilities —
 * whichever `<style>` tag the client inserts last.
 *
 * The classes below are the ones the real surfaces use (`grid-cols-1`,
 * `@3xl:grid-cols-4`, `hidden md:flex`, `p-4`), and every sheet is built by the
 * same helper the host packages call, so this pins the containment instead of a
 * hand-written imitation of it.
 */
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EMBEDDED_APPSTORE_CSS_LAYER,
  embedAppStylesheetInLayer,
} from '../../../packages/client/embedded-app-styles.ts'

const APPSTORE_UTILITIES = [
  '@layer properties{@supports (color:red){*{--tw-test:0}}}',
  '@layer theme{:root,:host{--spacing:.25rem}}',
  // A preflight-shaped reset: reaching another application's subtree strips its
  // padding and borders, which is exactly what a whole-sheet late layer did.
  '@layer base{*{box-sizing:border-box;margin:0;padding:0;border:0 solid}}',
  '@layer utilities{',
  '.\\@container{container-type:inline-size}',
  '.grid{display:grid}',
  '.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}',
  '@container (min-width:24rem){.\\@sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}}',
  '@container (min-width:32rem){.\\@lg\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}}',
  '@container (min-width:48rem){.\\@3xl\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}',
  '.hidden{display:none}',
  '@media (min-width:48rem){.md\\:flex{display:flex}}',
  '.p-4{padding:calc(var(--spacing) * 4)}',
  '}',
].join('')

/** Another embedded application's sheet: only the base utilities its own pages use. */
const COMPETING_UTILITIES = [
  '.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}',
  '.hidden{display:none}',
  '.p-4{padding:calc(var(--spacing) * 4)}',
].join('')

const FAMILY_SHEET = embedAppStylesheetInLayer(APPSTORE_UTILITIES, {
  layer: EMBEDDED_APPSTORE_CSS_LAYER,
  scope: '[data-appstore-surface]',
  splitUtilities: true,
})
/** The shape this containment replaces: the whole family sheet in the late layer. */
const WHOLE_LATE_SHEET = embedAppStylesheetInLayer(APPSTORE_UTILITIES, {
  layer: EMBEDDED_APPSTORE_CSS_LAYER,
  scope: '[data-appstore-surface]',
})
const COMPETING_SHEET = embedAppStylesheetInLayer(COMPETING_UTILITIES)
const SHARED_LAYER_SHEET = embedAppStylesheetInLayer(APPSTORE_UTILITIES)

const DOCUMENT = `<!doctype html><html><head></head><body>
  <div data-appstore-surface>
    <div class="@container" style="width:900px">
      <div id="grid" class="grid grid-cols-1 @3xl:grid-cols-4"><div>a</div><div>b</div><div>c</div><div>d</div></div>
    </div>
    <aside id="sidebar" class="hidden md:flex">nav</aside>
    <div id="inside-padded" class="p-4">app store content</div>
  </div>
  <div id="other-mode"><div id="outside-padded" class="p-4">another mode</div></div>
  <div id="outside" class="grid-cols-1"></div>
</body></html>`

/** Inject the given sheets in order and read what the document resolved. */
async function measure(
  browser: Browser,
  sheets: readonly string[],
  viewport: { width: number; height: number } = { width: 1400, height: 900 },
): Promise<{
  tracks: number
  sidebar: string
  outside: string
  insidePadding: string
  outsidePadding: string
}> {
  const page: Page = await browser.newPage({ viewport })
  try {
    await page.setContent(DOCUMENT)
    await page.evaluate((list: readonly string[]) => {
      for (const css of list) {
        const tag = document.createElement('style')
        tag.textContent = css
        document.head.appendChild(tag)
      }
    }, sheets)
    return await page.evaluate(() => {
      const columns = getComputedStyle(document.getElementById('grid')!).gridTemplateColumns
      return {
        tracks: columns.split(' ').filter(Boolean).length,
        sidebar: getComputedStyle(document.getElementById('sidebar')!).display,
        outside: getComputedStyle(document.getElementById('outside')!).gridTemplateColumns,
        insidePadding: getComputedStyle(document.getElementById('inside-padded')!).paddingTop,
        outsidePadding: getComputedStyle(document.getElementById('outside-padded')!).paddingTop,
      }
    })
  } finally {
    await page.close()
  }
}

describe('embedded application sheet containment', () => {
  let browser: Browser

  beforeAll(async () => { browser = await chromium.launch() })
  afterAll(async () => { await browser.close() })

  it('keeps the four-column agent grid when another application sheet is injected last', async () => {
    const result = await measure(browser, [FAMILY_SHEET, COMPETING_SHEET])

    expect(result.tracks).toBe(4)
    // The competitor's `.hidden` must not re-hide the shell's `hidden md:flex`.
    expect(result.sidebar).toBe('flex')
    // The family's own utilities still apply inside its surface.
    expect(result.insidePadding).toBe('16px')
  })

  it('keeps the grid when the family sheet is injected first', async () => {
    expect((await measure(browser, [COMPETING_SHEET, FAMILY_SHEET])).tracks).toBe(4)
  })

  it('keeps the family preflight out of another application\'s utilities', async () => {
    // Both injection orders: the shared-layer preflight stays below every
    // application's utilities, so another mode keeps its padding.
    expect((await measure(browser, [FAMILY_SHEET, COMPETING_SHEET])).outsidePadding).toBe('16px')
    expect((await measure(browser, [COMPETING_SHEET, FAMILY_SHEET])).outsidePadding).toBe('16px')
  })

  it('pins the regression a whole-sheet late layer causes', async () => {
    // Moving the whole sheet late carried its preflight above the other
    // application's utilities and stripped that page's padding.
    const result = await measure(browser, [WHOLE_LATE_SHEET, COMPETING_SHEET])

    expect(result.outsidePadding).toBe('0px')
    expect(result.insidePadding).toBe('16px')
  })

  it('reproduces the grid collision the late layer removes', async () => {
    // Both sheets in the shared layer: the later base `.grid-cols-1` outranks
    // the earlier `@3xl:grid-cols-4` and the wide grid collapses to one column.
    expect((await measure(browser, [SHARED_LAYER_SHEET, COMPETING_SHEET])).tracks).toBe(1)
  })

  it('keeps the family utilities out of unrelated document trees', async () => {
    expect((await measure(browser, [FAMILY_SHEET])).outside).toBe('none')
  })

  it('keeps the sidebar hidden below the breakpoint', async () => {
    const result = await measure(browser, [FAMILY_SHEET, COMPETING_SHEET], { width: 500, height: 800 })

    expect(result.sidebar).toBe('none')
  })
})
