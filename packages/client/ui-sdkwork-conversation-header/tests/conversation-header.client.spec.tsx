// @vitest-environment jsdom
/**
 * ui-sdkwork-conversation-header plugin halves: the browser entry claims the
 * 'conversation.session.header.surface' seat declared by ui-conversation's
 * header entry, registers its dictionaries, and renders the single-row header
 * body (breadcrumbs | segmented View control | utilities) as a pure function
 * of the owner share. The node half is inert.
 */
import { describe, expect, it } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import { en, NS, zh } from '../src/client/locales.ts'

/** Boot the browser half over a real slot tree that declares the surface seat. */
async function bench(): Promise<{ runtime: SlotTestRuntime; handle: { fiber: unknown; dispose(): Promise<void> } }> {
  const runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  locale.setLocale('zh')
  await runtime.root.declare({
    'conversation.session.header.surface': { kind: 'single', scope: 'session' },
  }, () => null)
  const handle = await runtime.mount({ inject: [...inject], apply })
  return { runtime, handle }
}

describe('ui-sdkwork-conversation-header browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('claims the header-surface seat, and teardown releases it (HMR safety)', async () => {
    const { runtime, handle } = await bench()
    expect(runtime.slots.entries('conversation.session.header.surface')).toHaveLength(1)
    await handle.dispose()
    expect(runtime.slots.entries('conversation.session.header.surface')).toHaveLength(0)
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { runtime, handle } = await bench()
    const translate = runtime.ctx.locale.bind(NS)
    expect(translate('header.viewsAria')).toBe(zh['header.viewsAria'])
    runtime.ctx.locale.setLocale('en')
    expect(translate('header.viewsAria')).toBe(en['header.viewsAria'])
    await handle.dispose()
    expect(translate('header.viewsAria')).not.toBe(en['header.viewsAria'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-sdkwork-conversation-header node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})
