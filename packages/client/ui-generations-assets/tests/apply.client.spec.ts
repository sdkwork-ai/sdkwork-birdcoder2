// @vitest-environment jsdom
/** Generated-assets apply contract: keyed navigation contributions shadow the placeholders at a lower priority and unwind on disposal. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-generations-assets/client'
import { AssetsPage } from '../src/client/AssetsPage.tsx'
import { AssetsGenerationsRailEntry } from '../src/client/RailEntry.tsx'
import type { AssetsPageInjected, AssetsGenerationsRailEntryInjected } from '@deepseek-ai/dsh-client-ui-generations-assets/client'

vi.mock('@sdkwork/agents-pc-assets', () => ({
  AssetsView: () => null,
}))
vi.mock('@sdkwork/drive-app-sdk', () => ({
  createClient: vi.fn(),
}))
vi.mock('@sdkwork/agents-pc-core/sdk/driveAppSdkClient', () => ({
  configureDriveAppSdkClientProvider: vi.fn(),
}))
vi.mock('@sdkwork/agents-pc-core/session', () => ({
  clearAppSdkSessionTokens: vi.fn(),
  createSdkworkChatRequestContextInterceptors: vi.fn(() => ({})),
  getSdkworkChatGlobalTokenManager: vi.fn(() => ({})),
  persistAppSdkSessionTokens: vi.fn(),
}))

const RAIL = 'mode.rail'
const RAIL_ENTRY = 'mode.rail.entry'
const PAGE = 'mode.page'

function fakeEnv() {
  return {
    isConfigured: () => false,
    apiBaseUrl: () => '',
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

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', fakeEnv())
  ctx.provide('iam', fakeIam())
  const slots = ctx.get('slots') as SlotRegistry
  if (declare) {
    slots.register({
      name: 'root',
      children: {
        [RAIL]: { kind: 'single', scope: 'root' },
        [PAGE]: { kind: 'keyed', scope: 'root' },
      },
    } as never, () => null)
    slots.register({
      name: RAIL,
      children: { [RAIL_ENTRY]: { kind: 'keyed', scope: 'root' } },
    } as never, () => null)
  }
  return { ctx, slots }
}

describe('ui-generations-assets apply', () => {
  it('declares the environment and IAM services', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam'])
  })

  it('registers the generated-assets rail entry and page by key with the shadow priority', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [rail] = b.slots.entries(RAIL_ENTRY)
    expect(rail?.options.key).toBe('assets')
    expect(rail?.options.priority).toBe(-10)
    expect(rail?.component).toBe(AssetsGenerationsRailEntry)
    expect(rail?.locale).toBe('generationsAssets')
    expect((rail.inject as unknown as () => AssetsGenerationsRailEntryInjected)().mode).toBe('assets')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('assets')
    expect(page?.options.priority).toBe(-10)
    expect(page?.component).toBe(AssetsPage)
    expect(page?.locale).toBe('generationsAssets')
    expect((page.inject as unknown as () => AssetsPageInjected)().mode).toBe('assets')
  })

  it('registers after the host seats arrive and tears down all contributions', async () => {
    const b = await bench(false)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)

    b.slots.register({
      name: 'root',
      children: {
        [RAIL]: { kind: 'single', scope: 'root' },
        [PAGE]: { kind: 'keyed', scope: 'root' },
      },
    } as never, () => null)
    b.slots.register({
      name: RAIL,
      children: { [RAIL_ENTRY]: { kind: 'keyed', scope: 'root' } },
    } as never, () => null)
    await Promise.resolve()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(1)
    expect(b.slots.entries(PAGE)).toHaveLength(1)

    await fiber.dispose()
    expect(b.slots.entries(RAIL_ENTRY)).toHaveLength(0)
    expect(b.slots.entries(PAGE)).toHaveLength(0)
  })
})
