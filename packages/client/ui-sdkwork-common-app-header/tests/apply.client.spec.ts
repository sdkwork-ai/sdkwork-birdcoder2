// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { WindowTitle } from '../src/client/WindowTitle.tsx'
import { apply as applyNode } from '../src/index.ts'

const SEAT = 'shell.window-title'

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  // The merged ui-renderer registry also augments the 'slots' key, so the
  // accessor's static type is that class; the mounted service is the runtime's.
  const slots = ctx.get('slots') as unknown as SlotRegistry
  if (declare) {
    slots.register(
      {
        name: 'root',
        children: {
          [SEAT]: { kind: 'single', scope: 'root' },
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

  it('registers the window-title projection into the seat once it is declared', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(slots.entries(SEAT)).toHaveLength(1)
    expect(slots.entries(SEAT)[0]?.component).toBe(WindowTitle)
    expect(slots.entries(SEAT)[0]?.locale).toBe('appHeader')
  })

  it('waits for the seat declaration before registering', async () => {
    const { ctx, slots } = await bench(false)
    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(slots.entries(SEAT)).toHaveLength(0)
  })

  // The host half exists only so the profile loader can mount the package: the
  // title projection is a browser concern, and the node entry must stay inert.
  it('keeps the host entry inert', () => {
    expect(applyNode).not.toThrow()
    expect(applyNode()).toBeUndefined()
  })
})
