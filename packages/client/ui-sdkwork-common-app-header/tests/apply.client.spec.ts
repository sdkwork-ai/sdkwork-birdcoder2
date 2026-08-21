// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { AppHeader } from '../src/client/AppHeader.tsx'

const HEADER = 'shell.app-header'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    slots.register(
      {
        name: 'root',
        children: {
          [HEADER]: { kind: 'single', scope: 'root' },
        },
      } as never,
      () => null,
    )
  }
  return { ctx, slots }
}

describe('ui-sdkwork-common-app-header client apply', () => {
  beforeEach(() => {
    delete (globalThis as { desktopBridge?: unknown }).desktopBridge
  })

  it('declares its service dependencies', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers AppHeader into shell.app-header once the slot is declared', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(slots.entries(HEADER)).toHaveLength(1)
    expect(slots.entries(HEADER)[0]?.component).toBe(AppHeader)
    expect(slots.spec('shell.app-header.leading')).toEqual({ kind: 'keyed', scope: 'root' })
    expect(slots.spec('shell.app-header.actions')).toEqual({ kind: 'list', scope: 'root' })
  })
})
