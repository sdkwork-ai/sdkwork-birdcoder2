import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sdkworkAuthAppearanceFor } from '../src/client/auth-appearance.ts'

const cssPath = join(dirname(fileURLToPath(import.meta.url)), '../src/client/sdkwork-auth.module.css')

describe('sdkworkAuthAppearanceFor', () => {
  it('paints light fields with overlay fill, not the collapsed layer whites', () => {
    const appearance = sdkworkAuthAppearanceFor('light')
    expect(appearance.theme?.fieldBackgroundColor).toBe('var(--dsw-alias-bg-overlay)')
    expect(appearance.theme?.fieldBorderColor).toBe('var(--dsw-alias-border-l2)')
    expect(appearance.theme?.fieldPlaceholderColor).toBe('var(--dsw-alias-label-tertiary)')
    expect(appearance.theme?.oauthProviderCardBackgroundColor).toBe('var(--dsw-alias-bg-overlay)')
    expect(appearance.theme?.shellBackgroundColor).toBe('var(--dsw-alias-bg-layer-2)')
    expect(appearance.theme?.fieldBackgroundColor).not.toBe(appearance.theme?.shellBackgroundColor)
  })

  it('keeps dark fields one step off the elevated shell', () => {
    const appearance = sdkworkAuthAppearanceFor('dark')
    expect(appearance.theme?.fieldBackgroundColor).toBe('var(--dsw-alias-bg-layer-1)')
    expect(appearance.theme?.shellBackgroundColor).toBe('var(--dsw-alias-bg-layer-2)')
    expect(appearance.theme?.fieldBackgroundColor).not.toBe(appearance.theme?.shellBackgroundColor)
  })

  it('paints the QR column with the shell and leaves the QR frame unfilled', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const appearance = sdkworkAuthAppearanceFor(scheme)
      expect(appearance.theme?.asidePanelBackgroundColor).toBe('var(--dsw-alias-bg-layer-2)')
      expect(appearance.theme?.asidePanelColor).toBe('var(--dsw-alias-label-primary)')
      expect(appearance.theme?.qrFrameBackgroundColor).toBe('transparent')
      expect(appearance.theme?.qrFrameBorderColor).toBe('transparent')
      expect(appearance.slotProps?.asideContainer?.style).toMatchObject({
        backgroundColor: 'transparent',
        padding: 0,
      })
    }
  })
})

describe('sdkwork-auth.module.css', () => {
  const css = readFileSync(cssPath, 'utf8')

  it('forces a visible field border and a flush QR column that follows the shell', () => {
    expect(css).toContain(':global(.sdkwork-auth-surface input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="submit"]):not([type="button"]):not([data-sdkwork-auth-secret-field="true"]))')
    expect(css).toContain('border-color: var(--sdkwork-auth-field-border-color, var(--dsw-alias-border-l2)) !important')
    expect(css).toContain(':global(.sdkwork-auth-shell > div:has([data-testid="sdkwork-auth-qr-frame"]) .bg-zinc-950)')
    expect(css).toContain('background-color: var(--dsw-alias-bg-layer-2) !important')
    expect(css).toContain('border-radius: 0 !important')
    expect(css).toContain('.bg-zinc-900\\/70')
    expect(css).toContain('background-color: transparent !important')
    expect(css).toContain(':global([data-testid="sdkwork-auth-qr-frame"] > div)')
    expect(css).toContain('background-color: #ffffff')
  })
})
