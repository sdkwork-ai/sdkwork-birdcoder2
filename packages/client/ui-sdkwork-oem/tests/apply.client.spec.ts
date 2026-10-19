// @vitest-environment jsdom
/** The OEM brand plugin applies the page projection to locale copy and the document title. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { OEM_BOOT_GLOBAL } from '@deepseek-ai/dsh-client-ui-primitives'
import { apply, inject } from '../src/client/index.ts'

const BOOT = {
  brand: { name: 'Acme Coder', companyName: 'Acme' },
  deepseek: {
    platformOrigin: 'https://platform.acme.test',
    inferenceOrigin: 'https://gateway.acme.test',
    messagesBaseUrl: 'https://gateway.acme.test/anthropic',
  },
}

function cleanup(): void {
  Reflect.deleteProperty(globalThis, OEM_BOOT_GLOBAL)
  document.title = ''
}

afterEach(cleanup)

async function bench(): Promise<{ ctx: Context; locale: LocaleRuntime; t: (key: string) => string }> {
  const ctx = new Context()
  const locale = new LocaleRuntime(ctx)
  // A stand-in for the common dictionary's shipped product name.
  locale.register('oem-test', 'en', { brand: 'BirdCoder', welcome: 'Welcome to BirdCoder' })
  ctx.provide('locale', locale)
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, locale, t: locale.bind('oem-test') }
}

describe('ui-sdkwork-oem client plugin', () => {
  it('declares the locale service it applies to', () => {
    expect(inject).toEqual(['locale'])
  })

  it('rebrands dictionary copy and the document title from the page projection', async () => {
    Reflect.set(globalThis, OEM_BOOT_GLOBAL, BOOT)
    const { ctx, t } = await bench()
    expect(t('brand')).toBe('Acme Coder')
    expect(t('welcome')).toBe('Welcome to Acme Coder')
    expect(document.title).toBe('Acme Coder')
    await ctx.fiber.dispose()
  })

  it('keeps the shipped brand without a page projection', async () => {
    const { ctx, t } = await bench()
    expect(t('brand')).toBe('BirdCoder')
    expect(t('welcome')).toBe('Welcome to BirdCoder')
    expect(document.title).toBe('BirdCoder')
    await ctx.fiber.dispose()
  })

  it('never rewrites a parameter value that spells the shipped name', async () => {
    Reflect.set(globalThis, OEM_BOOT_GLOBAL, BOOT)
    const { ctx, locale } = await bench()
    locale.register('oem-test-params', 'en', { greeting: 'Hello {name}' })
    expect(locale.bind('oem-test-params')('greeting', { name: 'BirdCoder' })).toBe('Hello BirdCoder')
    await ctx.fiber.dispose()
  })
})
