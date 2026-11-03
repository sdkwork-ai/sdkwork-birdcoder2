/**
 * Inspect-manifest publication across the Connection lifecycle: a page that
 * has no Host generation yet must not attempt a sync (it can only fail), while
 * a connected page publishes on registration and after each reset.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CordisInspectProviderManifest } from '@deepseek-ai/dsh-api-remotes/client'
import { ClientCordisInspectRegistry } from '../src/client/inspect-registry.ts'

const manifest: CordisInspectProviderManifest = {
  id: 'TestProvider',
  description: 'Test client inspect provider.',
  methods: [],
}

/** Publication hops through a queued microtask and the serialized sync chain. */
const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ClientCordisInspectRegistry publication', () => {
  it('holds the manifest until a Host generation exists, then publishes the complete set', async () => {
    let connected = false
    const sync = vi.fn(async (_providers: readonly CordisInspectProviderManifest[]) => {})
    const registry = new ClientCordisInspectRegistry({ sync, resolve: async () => {} }, () => connected)

    registry.register({ manifest, query: async () => null })
    await flush()
    expect(sync).not.toHaveBeenCalled()

    connected = true
    registry.register({ manifest: { ...manifest, id: 'SecondProvider' }, query: async () => null })
    await flush()
    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync.mock.calls[0]?.[0]).toEqual([
      manifest,
      { ...manifest, id: 'SecondProvider' },
    ])
  })

  it('publishes immediately for a carrier that owns no Connection', async () => {
    const sync = vi.fn(async () => {})
    const registry = new ClientCordisInspectRegistry({ sync, resolve: async () => {} })

    registry.register({ manifest, query: async () => null })
    await flush()
    expect(sync).toHaveBeenCalledExactlyOnceWith([manifest])
  })

  it('reports a sync failure that happens while connected', async () => {
    const failure = new Error('host refused the manifest')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const registry = new ClientCordisInspectRegistry({
      sync: async () => { throw failure },
      resolve: async () => {},
    })

    registry.register({ manifest, query: async () => null })
    await flush()
    await flush()
    expect(reported).toHaveBeenCalledWith('[cordis-client-runner] syncing inspect providers failed:', failure)
  })
})
