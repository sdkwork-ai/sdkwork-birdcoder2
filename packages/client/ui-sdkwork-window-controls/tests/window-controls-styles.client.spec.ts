/** CSS contracts for platform-specific window-control metrics and anchors. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/WindowControls.module.css', import.meta.url)), 'utf8')
const detailsCss = readFileSync(fileURLToPath(new URL(
  '../../ui-conversation/src/client/skeleton/DetailsPanel.module.css', import.meta.url)), 'utf8')

/**
 * Read declarations from one exact CSS selector.
 * @param selector - selector whose declarations are required.
 * @returns normalized declarations, or undefined when the selector is absent.
 */
function declarations(selector: string, stylesheet = css): Map<string, string> | undefined {
  const source = stylesheet.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
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

describe('WindowControls.module.css', () => {
  it('keeps a compact 12px default glyph and hit target', () => {
    const cluster = declarations('.cluster')
    const button = declarations('.button')
    const floating = declarations('.floating')
    const spacer = declarations('.inlineSpacer')
    expect(cluster?.get('--wc-glyph-size')).toBe('12px')
    expect(cluster?.get('--wc-button-width')).toBe('34px')
    expect(cluster?.get('--wc-button-height')).toBe('28px')
    expect(button?.get('width')).toBe('var(--wc-button-width)')
    expect(button?.get('height')).toBe('var(--wc-button-height)')
    expect(floating?.get('box-sizing')).toBe('border-box')
    expect(floating?.get('padding-top')).toBe('8px')
    expect(floating?.get('padding-right')).toBe('8px')
    expect(spacer?.get('width')).toBe('86px')
    expect(spacer?.get('height')).toBe('28px')
  })

  it('uses the Windows caption target and flush edge anchor', () => {
    const cluster = declarations(".cluster[data-platform='win32']")
    const floating = declarations(".floating[data-platform='win32']")
    const spacer = declarations(".inlineSpacer[data-platform='win32']")
    const detailsInset = declarations(":global(:root:has([data-dsh-window-controls][data-platform='win32']))")
    expect(cluster?.get('--wc-button-width')).toBe('45px')
    expect(cluster?.get('--wc-button-height')).toBe('32px')
    expect(cluster?.get('--wc-gap')).toBe('0')
    expect(floating?.get('padding-top')).toBe('0')
    expect(floating?.get('padding-right')).toBe('0')
    expect(spacer?.get('width')).toBe('107px')
    expect(spacer?.get('height')).toBe('32px')
    expect(detailsInset?.get('--dsh-window-controls-details-right')).toBe('143px')
  })

  it('uses GNOME header-bar metrics on Linux', () => {
    const cluster = declarations(".cluster[data-platform='linux']")
    const floating = declarations(".floating[data-platform='linux']")
    const spacer = declarations(".inlineSpacer[data-platform='linux']")
    const detailsInset = declarations(":global(:root:has([data-dsh-window-controls][data-platform='linux']))")
    expect(cluster?.get('--wc-button-width')).toBe('34px')
    expect(cluster?.get('--wc-button-height')).toBe('34px')
    expect(cluster?.get('--wc-gap')).toBe('3px')
    expect(cluster?.get('--wc-glyph-size')).toBe('16px')
    expect(floating?.get('padding-top')).toBe('6px')
    expect(floating?.get('padding-right')).toBe('7px')
    expect(spacer?.get('width')).toBe('87px')
    expect(spacer?.get('height')).toBe('34px')
    expect(detailsInset?.get('--dsh-window-controls-details-right')).toBe('123px')
  })

  it('keeps the macOS custom branch compact with mirrored title-bar insets', () => {
    const cluster = declarations(".cluster[data-platform='darwin']")
    const floating = declarations(".floating[data-platform='darwin']")
    const spacer = declarations(".inlineSpacer[data-platform='darwin']")
    const detailsInset = declarations(":global(:root:has([data-dsh-window-controls][data-platform='darwin']))")
    expect(cluster?.get('--wc-button-width')).toBe('28px')
    expect(cluster?.get('--wc-button-height')).toBe('28px')
    expect(cluster?.get('--wc-glyph-size')).toBe('12px')
    expect(floating?.get('padding-top')).toBe('12px')
    expect(floating?.get('padding-right')).toBe('12px')
    expect(spacer?.get('width')).toBe('72px')
    expect(spacer?.get('height')).toBe('28px')
    expect(detailsInset?.get('--dsh-window-controls-details-right')).toBe('108px')
  })

  it('keeps the details close action clear of every frame anchor', () => {
    const otherInset = declarations(":global(:root:has([data-dsh-window-controls][data-platform='other']))")
    const detailsHeader = declarations('.header', detailsCss)
    expect(otherInset?.get('--dsh-window-controls-details-right')).toBe('122px')
    expect(detailsHeader?.get('padding')).toBe(
      '14px var(--dsh-window-controls-details-right, 12px) 12px 12px')
  })
})
