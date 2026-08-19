// @vitest-environment jsdom
/** Image generation apply contract: keyed navigation contributions wait for their host seats and unwind on disposal. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-generations-image/client'
import { ImageGenerationsPage } from '../src/client/GenerationsPage.tsx'
import { ImageGenerationsRailEntry } from '../src/client/RailEntry.tsx'
import type { ImageGenerationsPageInjected, ImageGenerationsRailEntryInjected } from '@deepseek-ai/dsh-client-ui-generations-image/client'

vi.mock('@sdkwork/agents-pc-creative', () => ({
  CreativeView: () => null,
}))
vi.mock('@sdkwork/generations-app-sdk', () => ({
  createClient: vi.fn(),
}))
vi.mock('@sdkwork/drive-app-sdk', () => ({
  createClient: vi.fn(),
}))
vi.mock('@sdkwork/agents-pc-core/sdk/generationsAppSdkClient', () => ({
  configureGenerationsAppSdkClientProvider: vi.fn(),
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
    appId: () => 'app-id',
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

function fakeTheme() {
  return {
    getTheme: () => ({ active: { colorScheme: 'light' as const } }),
    subscribe: () => () => {},
  }
}

async function bench(declare = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('env', fakeEnv())
  ctx.provide('iam', fakeIam())
  ctx.provide('theme', fakeTheme())
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

describe('ui-generations-image apply', () => {
  it('declares the environment and IAM services', () => {
    expect(inject).toEqual(['slots', 'locale', 'env', 'iam', 'theme'])
  })

  it('registers the image generation rail entry and page by key', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const [rail] = b.slots.entries(RAIL_ENTRY)
    expect(rail?.options.key).toBe('image')
    expect(rail?.component).toBe(ImageGenerationsRailEntry)
    expect(rail?.locale).toBe('generationsImage')
    expect((rail.inject as unknown as () => ImageGenerationsRailEntryInjected)().mode).toBe('image')

    const [page] = b.slots.entries(PAGE)
    expect(page?.options.key).toBe('image')
    expect(page?.component).toBe(ImageGenerationsPage)
    expect(page?.locale).toBe('generationsImage')
    expect((page.inject as unknown as () => ImageGenerationsPageInjected)().mode).toBe('image')
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
