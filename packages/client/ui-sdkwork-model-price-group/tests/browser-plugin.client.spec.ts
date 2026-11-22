import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { ModelPriceGroupPane } from '../src/client/ModelPriceGroupPane.tsx'
import { ModelPriceGroupRow } from '../src/client/ModelPriceGroupRow.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

const MODEL = 'deepseek/deepseek-flash'

async function bench() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', { apiBaseUrl: () => '', accessToken: () => '' } as never)
  ctx.provide('iam', { controller: { getState: () => ({ session: null }) } } as never)
  await ctx.plugin(SlotRegistry).await()
  const header = ctx.slots.register({
    name: 'root',
    children: {
      'conversation.input.model': { kind: 'single', scope: 'session' },
    },
  } as never, () => null)
  const model = ctx.slots.register({
    name: 'conversation.input.model',
    children: {
      'conversation.input.model.options': { kind: 'list', scope: 'session' },
      'conversation.input.model.pane': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  const row = () => ctx.slots.entries('conversation.input.model.options')
    .find(candidate => candidate.component === ModelPriceGroupRow)
  const pane = () => ctx.slots.entries('conversation.input.model.pane')
    .find(candidate => candidate.component === ModelPriceGroupPane)
  return { ctx, fiber, header, model, row, pane }
}

it('is a browser-only plugin with no Host behavior', () => {
  expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  expect(nodeApply()).toBeUndefined()
})

it('registers one disposable summary row and one keyed pane', async () => {
  const b = await bench()
  expect(b.row()).toMatchObject({
    options: { id: 'model-price-group' },
    locale: 'model-price-group',
  })
  expect(b.pane()).toMatchObject({
    options: { key: 'model-price-group' },
    locale: 'model-price-group',
  })
  const injected = b.pane()!.inject!() as unknown as {
    hooks: { priceGroup: { getSnapshot(): unknown } }
    load: (model: string) => void
    select: (input: { model: string; groupCode: string | null }) => Promise<string | null>
  }
  expect(injected.hooks.priceGroup.getSnapshot()).toMatchObject({ status: 'idle', model: null, groups: [] })
  // No gateway origin in this deployment: the read fails closed instead of
  // throwing out of the fire-and-forget load.
  injected.load(MODEL)
  await expect.poll(() => injected.hooks.priceGroup.getSnapshot()).toMatchObject({
    status: 'failed',
    model: MODEL,
  })
  await expect(injected.select({ model: MODEL, groupCode: 'cheap' }))
    .resolves.toContain('gateway origin is not configured')
  await b.fiber.dispose()
  expect(b.row()).toBeUndefined()
  expect(b.pane()).toBeUndefined()
  const t = b.ctx.locale.bind('model-price-group')
  expect(t('row.label')).toBe('row.label')
})

it('re-registers when the model menu slot is declared again', async () => {
  const b = await bench()
  expect(b.row()).toBeDefined()
  b.model()
  expect(b.row()).toBeUndefined()
  b.ctx.slots.register({
    name: 'conversation.input.model',
    children: {
      'conversation.input.model.options': { kind: 'list', scope: 'session' },
      'conversation.input.model.pane': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  await Promise.resolve()
  expect(b.row()).toBeDefined()
  expect(b.pane()).toBeDefined()
  await b.fiber.dispose()
})
