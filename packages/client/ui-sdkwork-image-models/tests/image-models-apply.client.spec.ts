/**
 * Registration and write-path spec for the image model configuration page: the
 * `settings.section` contribution the browser half installs, and every write
 * the injected face performs against the settings scope.
 *
 * The page is mounted over the real slot registry and locale runtime with a
 * stand-in configuration form, because what is under test is the seam between
 * the page's intents and the section value: computing the next provider array
 * needs the *current* one, and the credential rule (an untouched key must
 * survive a save that rewrites the row) lives entirely on this side.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject, mergeProvider, nextRelayId } from '../src/client/index.ts'
import type { ImageModelsSectionInjected } from '../src/client/ImageModelsSection.tsx'
import {
  DEFAULT_PROVIDER_FIELD, IMAGE_MODELS_FILE_GLOBAL, IMAGE_MODELS_NAMESPACE, PROVIDERS_FIELD,
  WRITE_SECRETS_FIELD, type SdkworkImageModelsSettings, type SdkworkImageProvider,
} from '../src/image-models-settings.ts'

/** One official row and one relay row, as the resolved section carries them. */
function rows(): SdkworkImageProvider[] {
  return [
    {
      id: 'official-openai-global',
      label: 'OpenAI',
      kind: 'official',
      vendor: 'openai',
      protocol: 'openai_compatible',
      region: 'global',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-stored',
      apiKeyEnv: '',
      enabled: false,
      models: [{
        id: 'gpt-image-2', displayName: 'GPT Image 2', catalogKey: 'openai/gpt-image-2',
        enabled: true, size: '', quality: '', count: 1,
      }],
    },
    {
      id: 'relay-1',
      label: '',
      kind: 'relay',
      vendor: '',
      protocol: 'openai_compatible',
      region: '',
      baseUrl: 'https://relay.example.com/v1',
      apiKey: '',
      apiKeyEnv: 'RELAY_API_KEY',
      enabled: true,
      models: [],
    },
  ]
}

/**
 * A bare relay row, for the helpers that only read ids.
 * @param id - the row's id.
 * @returns the row.
 */
function relayRow(id: string): SdkworkImageProvider {
  return {
    id,
    label: '',
    kind: 'relay',
    vendor: '',
    protocol: '',
    region: '',
    baseUrl: '',
    apiKey: '',
    apiKeyEnv: '',
    enabled: false,
    models: [],
  }
}

/** A settings scope stand-in whose snapshot and write outcomes the spec drives. */
function scopeOf(value: SdkworkImageModelsSettings = {
  [DEFAULT_PROVIDER_FIELD]: '',
  [PROVIDERS_FIELD]: rows(),
  [WRITE_SECRETS_FIELD]: false,
}) {
  let snapshot: ConfigFormSnapshot<SdkworkImageModelsSettings> = {
    status: 'ready',
    value,
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
  }
  const set = vi.fn((field: string, value: unknown) => {
    void field
    void value
    return Promise.resolve(true)
  })
  const form: ConfigForm<SdkworkImageModelsSettings> = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set,
    unset: vi.fn(() => Promise.resolve(true)),
    mutate: vi.fn(() => Promise.resolve(true)),
  }
  return {
    scope: form,
    set,
    publish: (next: ConfigFormSnapshot<SdkworkImageModelsSettings>) => { snapshot = next },
  }
}

/** Mount the browser half over the real registries and a stand-in scope. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const form = scopeOf()
  ctx.provide('configForms' as never, { get: () => form.scope } as never)
  const slots = ctx.get('slots') as SlotRegistry
  // The settings shell owns the declaration; this stands in for it so the
  // contribution's own `slots.inject` has something to wait for.
  slots.register({
    name: 'root',
    children: { 'settings.section': { kind: 'list', scope: 'root' } },
  } as never, () => null)
  const plugin = ctx.plugin({ inject: [...inject], apply })
  await plugin.await()
  const entry = slots.entries('settings.section')[0]
  if (entry === undefined) throw new Error('settings section not registered')
  const baked = {
    mirror: vi.fn(),
    file: vi.fn(),
    writeSecrets: vi.fn(),
    writing: vi.fn(),
    settled: vi.fn(),
  }
  if (entry.inject === undefined) throw new Error('settings section carries no inject face')
  // The stored entry types its `inject` face opaquely; the spec supplies the
  // contract this package registered it with.
  const face: unknown = entry.inject
  if (typeof face !== 'function') throw new Error('settings section inject face is not callable')
  const injected = (face as (bound: typeof baked) => ImageModelsSectionInjected)(baked)
  return { ctx, entry, injected, baked, set: form.set, publish: form.publish, locale }
}

/**
 * The live provider rows one recorded write carried.
 * @param set - the scope's recorded `set` mock.
 * @param call - which call to read.
 * @returns the provider array the write submitted.
 */
function writtenProviders(set: WriteSpy, call = 0): SdkworkImageProvider[] {
  const value: unknown = set.mock.calls[call]?.[1]
  return value as SdkworkImageProvider[]
}

/** The scope's `set` mock, with the parameters the plugin writes. */
type WriteSpy = ReturnType<typeof scopeOf>['set']

describe('image models browser half', () => {
  it('contributes one settings section after the shared model pages', async () => {
    const { entry, ctx } = await bench()

    expect(entry.options.id).toBe('image-models')
    expect(entry.options.order).toBe(21)
    expect(resolveSlotLabel(entry.options.label)).toBeTruthy()
    await ctx.fiber.dispose()
  })

  it('mirrors the scope into the page store, reporting a credential as presence only', async () => {
    const { baked, ctx } = await bench()

    expect(baked.mirror).toHaveBeenCalledTimes(1)
    const view = baked.mirror.mock.calls[0]?.[0] as {
      status: string
      writable: boolean
      defaultProviderId: string
      providers: readonly { id: string; hasApiKey: boolean }[]
    }
    expect(view.status).toBe('ready')
    expect(view.writable).toBe(true)
    expect(view.defaultProviderId).toBe('')
    expect(view.providers.map(provider => provider.id)).toEqual(['official-openai-global', 'relay-1'])
    expect(view.providers[0]?.hasApiKey).toBe(true)
    await ctx.fiber.dispose()
  })

  it('publishes the projection path the Host put on the page', async () => {
    const target = globalThis as Partial<Record<typeof IMAGE_MODELS_FILE_GLOBAL, unknown>>
    target[IMAGE_MODELS_FILE_GLOBAL] = { path: '/home/user/.dsh/sdkwork/image-models.sdkwork.json' }
    try {
      const { baked, ctx } = await bench()

      expect(baked.file).toHaveBeenCalledWith('/home/user/.dsh/sdkwork/image-models.sdkwork.json')
      await ctx.fiber.dispose()
    } finally {
      Reflect.deleteProperty(target, IMAGE_MODELS_FILE_GLOBAL)
    }
  })

  it('appends a relay row when asked for one', async () => {
    const { injected, set, ctx } = await bench()

    injected.addRelay()

    const written = writtenProviders(set)
    expect(written.map(provider => provider.id)).toEqual(['official-openai-global', 'relay-1', 'relay-2'])
    expect(written[2]?.kind).toBe('relay')
    expect(written[2]?.baseUrl).toBe('')
    expect(written[2]?.enabled).toBe(true)
    await ctx.fiber.dispose()
  })

  it('writes one provider row back without dropping the stored key it never received', async () => {
    const { injected, set, ctx } = await bench()

    injected.saveProvider({
      id: 'official-openai-global',
      label: 'OpenAI direct',
      kind: 'official',
      vendor: 'openai',
      protocol: 'openai_compatible',
      region: 'global',
      baseUrl: 'https://gateway.example.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
      apiKey: undefined,
      enabled: true,
      models: [{ id: 'gpt-image-2', displayName: 'GPT Image 2', catalogKey: 'openai/gpt-image-2', enabled: true, size: '1024x1024', quality: 'high', count: 2 }],
    })

    const written = writtenProviders(set)
    expect(written[0]?.label).toBe('OpenAI direct')
    expect(written[0]?.enabled).toBe(true)
    expect(written[0]?.apiKey).toBe('sk-stored')
    expect(written[0]?.models[0]?.count).toBe(2)
    expect(written[1]?.id).toBe('relay-1')
    await ctx.fiber.dispose()
  })

  it('clears a stored key only when the page submits an empty one', async () => {
    const { injected, set, ctx } = await bench()

    injected.saveProvider({
      id: 'official-openai-global',
      label: 'OpenAI',
      kind: 'official',
      vendor: 'openai',
      protocol: 'openai_compatible',
      region: 'global',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: '',
      apiKey: '',
      enabled: false,
      models: [],
    })

    const written = writtenProviders(set)
    expect(written[0]?.apiKey).toBe('')
    await ctx.fiber.dispose()
  })

  it('adds a provider row the section does not carry yet', async () => {
    const { injected, set, ctx } = await bench()

    injected.saveProvider({
      id: 'relay-2',
      label: 'relay two',
      kind: 'relay',
      vendor: '',
      protocol: 'openai_compatible',
      region: '',
      baseUrl: 'https://second.example.com/v1',
      apiKeyEnv: '',
      apiKey: 'sk-new',
      enabled: true,
      models: [],
    })

    const written = writtenProviders(set)
    expect(written.map(provider => provider.id)).toEqual(['official-openai-global', 'relay-1', 'relay-2'])
    expect(written[2]?.apiKey).toBe('sk-new')
    await ctx.fiber.dispose()
  })

  it('flips one enable switch, removes one row, and moves the default', async () => {
    const { injected, set, ctx } = await bench()

    injected.setProviderEnabled('official-openai-global', true)
    expect(writtenProviders(set)[0]?.enabled).toBe(true)
    expect(writtenProviders(set)[1]?.enabled).toBe(true)

    injected.removeProvider('relay-1')
    expect(writtenProviders(set, 1).map(provider => provider.id))
      .toEqual(['official-openai-global'])

    injected.setDefaultProvider('relay-1')
    expect(set.mock.calls[2]?.[0]).toBe(DEFAULT_PROVIDER_FIELD)
    expect(set.mock.calls[2]?.[1]).toBe('relay-1')

    injected.setWriteSecrets(true)
    expect(set.mock.calls[3]?.[0]).toBe(WRITE_SECRETS_FIELD)
    expect(set.mock.calls[3]?.[1]).toBe(true)
    await ctx.fiber.dispose()
  })

  it('reports a refused write and a transport failure through the store', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { injected, baked, set, ctx } = await bench()

    set.mockResolvedValueOnce(false)
    injected.removeProvider('relay-1')
    await vi.waitFor(() => { expect(baked.settled).toHaveBeenCalledWith(false) })
    expect(baked.writing).toHaveBeenCalled()

    set.mockRejectedValueOnce(new Error('offline'))
    injected.removeProvider('relay-1')
    await vi.waitFor(() => { expect(error).toHaveBeenCalled() })
    expect(baked.settled).toHaveBeenLastCalledWith(false)
    error.mockRestore()
    await ctx.fiber.dispose()
  })

  it('names the settings section after its own namespace', async () => {
    const { ctx } = await bench()

    expect(IMAGE_MODELS_NAMESPACE).toBe('ui-sdkwork-image-models')
    await ctx.fiber.dispose()
  })
})

describe('provider merge helpers', () => {
  it('mints the first unused relay id', () => {
    expect(nextRelayId([])).toBe('relay-1')
    expect(nextRelayId([relayRow('relay-1')])).toBe('relay-2')
    expect(nextRelayId([
      relayRow('relay-1'), relayRow('relay-2'), relayRow('official-x'),
    ])).toBe('relay-3')
  })

  it('replaces a row in place and appends an unknown one', () => {
    const stored = rows()
    const replaced = mergeProvider(stored, {
      id: 'relay-1',
      label: 'renamed',
      kind: 'relay',
      vendor: '',
      protocol: 'openai_compatible',
      region: '',
      baseUrl: 'https://relay.example.com/v2',
      apiKeyEnv: '',
      apiKey: undefined,
      enabled: false,
      models: [],
    })
    expect(replaced.map(provider => provider.id)).toEqual(['official-openai-global', 'relay-1'])
    expect(replaced[1]?.label).toBe('renamed')
    expect(replaced[1]?.apiKey).toBe('')

    const appended = mergeProvider(stored, {
      id: 'relay-9',
      label: '',
      kind: 'relay',
      vendor: '',
      protocol: '',
      region: '',
      baseUrl: '',
      apiKeyEnv: '',
      apiKey: undefined,
      enabled: false,
      models: [],
    })
    expect(appended.map(provider => provider.id)).toEqual(['official-openai-global', 'relay-1', 'relay-9'])
  })
})
