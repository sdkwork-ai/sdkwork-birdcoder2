import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/MarketsPage.module.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ')

function rule(selector: string): string {
  const matches: string[] = []
  let offset = 0
  while (offset < css.length) {
    const start = css.indexOf(selector, offset)
    if (start < 0) break
    const open = css.indexOf('{', start)
    const end = css.indexOf('}', open)
    // Grouped selector lists put the block's opening brace further from the
    // first selector; the cap only rejects a selector that leaked into prose.
    if (open >= 0 && end >= 0 && open - start < 520) matches.push(css.slice(start, end + 1))
    offset = start + selector.length
  }
  if (matches.length === 0) throw new Error(`missing CSS rule: ${selector}`)
  return matches.join(' ')
}

describe('MarketsPage Plugins catalog styles', () => {
  it('puts the catalog tools in the page header row, not over the catalog', () => {
    expect(rule('.page')).toContain('position: relative')
    // The row holds the category tabs and the trailing tools, like every other
    // category: the catalog itself draws no header to pin.
    expect(rule('.pluginMarketHeader')).toContain('background: var(--dsw-alias-bg-base)')
    expect(rule('.header, .pluginMarketHeader')).toContain('justify-content: space-between')
    expect(css).not.toContain('main > header')
  })

  it('leaves the catalog wrappers unpositioned so its rows keep their place', () => {
    expect(rule('.pluginMarketplace :global(main)')).toContain('position: static')
    expect(rule('.pluginMarketplace')).toContain('position: static')
    expect(rule('.marketScroll, .pluginMarketplace, .pluginMarketplace :global(main)')).toContain('position: static')
  })

  it('uses the compact control and content scale', () => {
    expect(rule('.pluginMarketplace :global(main > nav button)')).toContain('min-height: 26px')
    // The category strip's overflow toggle is an icon control, not a chip.
    expect(rule('.pluginMarketplace :global(main > nav [data-category-toggle])')).toContain('width: 28px')
    expect(rule('.pluginMarketplace :global(main > nav [data-category-toggle])')).toContain('border-radius: 999px')
    expect(rule('.pluginMarketplace :global(main h1)')).toContain('font-size: 15px')
    expect(rule('.pluginMarketplace :global(main h1)')).toContain('font-weight: 500')
    expect(rule('.pluginMarketplace :global(main article > span:first-child > span:nth-child(2))')).toContain('font-size: 16px')
    expect(rule('.pluginMarketplace :global(main article > div:nth-child(2) > div:first-child)')).toContain('font-size: 14px')
    expect(rule('.pluginMarketplace :global(main article > div:nth-child(2) > div:nth-child(2))')).toContain('font-size: 13px')
    expect(rule('.pluginMarketplace :global(main article > span:last-child span button)')).toContain('min-height: 28px')
    expect(rule('.pluginMarketplace :global(main article > span:first-child > span:last-child span button)')).toContain('min-height: 28px')
  })

  it('paints catalog surfaces and controls as flat washes without resting borders', () => {
    expect(rule('.pluginMarketplace :global(main > nav button[class*="categoryActive"])')).toContain('background: var(--dsw-alias-interactive-bg-active)')
    expect(rule('.pluginMarketplace :global(main article[class*="featureCard"])')).toContain('border: 0;')
    expect(rule('.pluginMarketplace :global(main article[class*="featureCard"])')).toContain('background: var(--dsw-alias-interactive-bg-hover)')
    expect(rule('.pluginMarketplace :global(main article > div:first-child[aria-hidden="true"])')).toContain('background: var(--dsw-alias-interactive-bg-active)')
  })
})

describe('MarketsPage cloud catalog flat surfaces', () => {
  for (const surface of ['markets-experts', 'markets-mcp']) {
    it(`collapses the ${surface} frames to fills`, () => {
      expect(rule(`.panelArea [data-sdk-surface='${surface}'] [class*='border-store-']`)).toContain('border-color: transparent')
      expect(rule(`.panelArea [data-sdk-surface='${surface}'] [class~='rounded-store-card']`)).toContain('background: var(--dsw-alias-interactive-bg-hover)')
      expect(rule(`.panelArea [data-sdk-surface='${surface}'] [class~='shadow-sm']`)).toContain('box-shadow: none')
      expect(rule(`.panelArea [data-sdk-surface='${surface}'] :is([class~='bg-store-surface'], [class~='bg-store-subtle'])[class~='cursor-pointer']:hover`)).toContain('background-color: var(--dsw-alias-interactive-bg-active)')
    })
  }

  it('keeps the cloud cards wide enough for their titles', () => {
    // Four columns squeeze a card header's title behind its badge; the 48rem
    // tier steps down to three.
    expect(css).toContain('@container (min-width: 48rem)')
    expect(rule(".panelArea [data-sdk-surface='markets-experts'] [class~='grid']")).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(rule(".panelArea [data-sdk-surface='markets-mcp'] [class~='grid']")).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
  })

  it('renders the connector status on one line and its connect control as a wash', () => {
    expect(rule(".panelArea [data-sdk-surface='markets-mcp'] span[class~='inline-flex'][class~='rounded-full']")).toContain('white-space: nowrap')
    expect(rule(".panelArea [data-sdk-surface='markets-mcp'] button[class*='bg-store-subtle']")).toContain('background: var(--dsw-alias-interactive-bg-hover)')
    expect(rule(".panelArea [data-sdk-surface='markets-mcp'] button[class*='bg-store-subtle']")).toContain('box-shadow: none')
  })
})

describe('MarketsPage expert-market flat surfaces', () => {
  it('collapses the library chrome to washes and clears its rules', () => {
    for (const selector of ['.panelArea :global(.aag-section-card)', '.panelArea :global(.aag-expert-card)']) {
      expect(rule(selector)).toContain('border-color: transparent')
      expect(rule(selector)).toContain('background: var(--dsw-alias-interactive-bg-hover)')
    }
    expect(rule('.panelArea :global(.aag-expert-card):hover')).toContain('border-color: transparent')
    expect(rule('.panelArea :global(.aag-card-actions)')).toContain('border-top-color: transparent')
    expect(rule('.panelArea :global(.aag-card-action + .aag-card-action)')).toContain('border-left-color: transparent')
    expect(rule('.panelArea :global(.aag-division-pill)')).toContain('border-color: transparent')
    expect(rule('.panelArea :global(.aag-chip)')).toContain('background: var(--dsw-alias-interactive-bg-hover)')
    expect(rule('.panelArea :global(.aag-empty)')).toContain('border: 0')
  })

  it('removes the ringed tab strip and the outlined selects', () => {
    expect(rule('.panelArea :global(.aag-library-tabs)')).toContain('box-shadow: none')
    expect(rule('.panelArea :global(.aag-library-tabs)')).toContain('background: var(--dsw-alias-interactive-bg-hover)')
    expect(rule(".panelArea :global(.aag-library-tabs > span[aria-hidden='true'])")).toContain('border-color: transparent')
    expect(rule('.panelArea :global(.aag-menu-select-trigger)')).toContain('border-color: transparent')
    expect(rule('.panelArea :global(.aag-settings-links button)')).toContain('box-shadow: none')
  })

  it('keeps every library class global so the module cannot hash it', () => {
    // CSS modules hash bare class names into this file's own scope, which
    // turned these rules into no-ops against the agency markup.
    for (const match of css.matchAll(/\.panelArea\s+(\.aag-[\w-]+)/g)) {
      throw new Error(`unscoped library class leaked into a module selector: ${match[1]}`)
    }
  })

  it('flattens the library search field and its outlined buttons', () => {
    expect(rule('.panelArea :global(.aag-host-input)')).toContain('border-color: transparent')
    expect(rule('.panelArea :global(.aag-host-input)')).toContain('background: var(--dsw-alias-interactive-bg-hover)')
    expect(rule(".panelArea :global(.aag-host-btn[class*='_outline_'])")).toContain('box-shadow: none')
    expect(rule(".panelArea :global(.aag-host-btn[class*='_outline_'])")).toContain('border-color: transparent')
  })
})
