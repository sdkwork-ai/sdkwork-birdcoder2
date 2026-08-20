/** ui-course apply wiring: the rail entry and the SDKWork page, each keyed by
 * the `course` mode id, register once their slot declarations are on the
 * ledger; the host adapter and slot contributions tear down together. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { ThemeRuntime } from '@deepseek-ai/dsh-client-ui-theme/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-course/client'
import type {
  CoursePageInjected, CourseRailEntryInjected,
} from '@deepseek-ai/dsh-client-ui-course/client'
import { CourseRailEntry } from '../src/client/RailEntry.tsx'
import { CoursePage } from '../src/client/CoursePage.tsx'

const RAIL_ENTRY = 'mode.rail.entry'
const PAGE = 'mode.page'

function fakeEnv() {
  return {
    apiBaseUrl: () => 'https://fixture.example',
    accessToken: () => '',
    subscribe: () => () => {},
  }
}

function fakeIam() {
  return {
    controller: {
      getState: () => ({ session: null }),
      subscribe: () => () => {},
    },
  }
}

function fakeTheme(ctx: Context) {
  const host = {
    getSnapshot: () => ({ value: { preference: 'light' as const } }),
    subscribe: () => () => {},
    set: async () => {},
    bind: () => host,
  }
  return new ThemeRuntime(ctx, host as never)
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', fakeEnv())
  ctx.provide('iam', fakeIam())
  ctx.provide('theme', fakeTheme(ctx))
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    slots.register(
      { name: 'root', children: { 'mode.rail': { kind: 'single', scope: 'root' }, [PAGE]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
    slots.register(
      { name: 'mode.rail', children: { [RAIL_ENTRY]: { kind: 'keyed', scope: 'root' } } } as never,
      () => null,
    )
  }
  return { ctx, slots }
}

describe('ui-course apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'theme'])
  })

  it('registers the rail entry and the page keyed by the course mode id', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [entry] = b.slots.entries(RAIL_ENTRY)
    expect(entry?.options.key).toBe('course')
    expect(entry?.component).toBe(CourseRailEntry)
    expect(entry?.locale).toBe('course')
    expect((entry.inject as unknown as () => CourseRailEntryInjected)().mode).toBe('course')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('course')
    expect(page?.component).toBe(CoursePage)
    expect((page.inject as unknown as () => CoursePageInjected)().mode).toBe('course')
  })

  it('teardown removes the entries and the dictionaries', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)
    await fiber.dispose()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
