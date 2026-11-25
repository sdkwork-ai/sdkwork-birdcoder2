import { afterEach, describe, expect, it, vi } from 'vitest'
import { startExpertCatalogSync, type ExpertCatalogSyncAdapter } from '../src/client/expertCatalogSyncRunner.ts'
import type {
  ExpertCatalogSdkClient,
  ExpertCatalogSyncRemote,
} from '../src/client/expertCatalogSync.ts'

/** An adapter the test drives directly. */
function fakeAdapter(state: { configured: boolean; identity: string; language: string }): {
  adapter: ExpertCatalogSyncAdapter
  emit(): void
} {
  const listeners = new Set<() => void>()
  return {
    adapter: {
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getSnapshot: () => ({ configured: state.configured }),
      getIdentityKey: () => state.identity,
      resolveHostLanguage: () => state.language,
    },
    emit() {
      for (const listener of listeners) listener()
    },
  }
}

/** A client that serves one expert and no teams. */
function fakeClient(): { client: ExpertCatalogSdkClient; count(): number } {
  let reads = 0
  const client = {
    ai: {
      experts: {
        divisions: { list: async () => ({ items: [] }) },
        list: async () => {
          reads += 1
          return { items: [{ slug: 'product-manager', agentId: 'agent.expert.product-manager', name: '产品经理', description: '需求', emoji: '🧩', divisionCode: 'product', tags: ['expert'] }] }
        },
      },
      expertTeams: { list: async () => ({ items: [] }) },
      expertPersonas: { list: async () => ({ items: [] }) },
    },
  } as unknown as ExpertCatalogSdkClient
  return { client, count: () => reads }
}

/** A Remote double that records calls. */
function fakeRemote(): { remote: ExpertCatalogSyncRemote; readonly calls: number } {
  const state = { calls: 0 }
  const remote: ExpertCatalogSyncRemote = {
    async syncSdkworkCatalog(payload) {
      state.calls += 1
      return { ok: true, value: { experts: payload.experts.length, teams: payload.teams.length } }
    },
    async syncSdkworkPersonas(payload) {
      state.calls += 1
      return { ok: true, value: { count: payload.personas.length } }
    },
  }
  return { remote, get calls() { return state.calls } }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('startExpertCatalogSync', () => {
  it('waits for a configured gateway, a session, and the Remote namespace', async () => {
    const state = { configured: false, identity: '', language: 'zh-CN' }
    const { adapter } = fakeAdapter(state)
    const remote = fakeRemote()
    const { client } = fakeClient()
    const runner = startExpertCatalogSync({
      adapter,
      resolveRemote: () => remote.remote,
      readClient: () => client,
      retryDelaysMs: [],
    })
    expect(await runner.syncNow()).toBeUndefined()
    state.configured = true
    expect(await runner.syncNow()).toBeUndefined()
    state.identity = 'tenant:user'
    const summary = await runner.syncNow()
    expect(summary?.experts).toBe(1)
    runner.dispose()
  })

  it('retries while the Remote namespace is still mounting', async () => {
    vi.useFakeTimers()
    const state = { configured: true, identity: 'tenant:user', language: 'zh-CN' }
    const { adapter } = fakeAdapter(state)
    const { client } = fakeClient()
    const remote = fakeRemote()
    let mounted = false
    const runner = startExpertCatalogSync({
      adapter,
      resolveRemote: () => (mounted ? remote.remote : undefined),
      readClient: () => client,
      retryDelaysMs: [10],
    })
    await runner.syncNow()
    expect(remote.calls).toBe(0)
    mounted = true
    await vi.advanceTimersByTimeAsync(20)
    expect(remote.calls).toBe(1)
    runner.dispose()
  })

  it('pushes once per identity, gateway and locale and re-pushes after a change', async () => {
    const state = { configured: true, identity: 'tenant:a', language: 'zh-CN' }
    const { adapter, emit } = fakeAdapter(state)
    const remote = fakeRemote()
    const { client } = fakeClient()
    const runner = startExpertCatalogSync({ adapter, resolveRemote: () => remote.remote, readClient: () => client, retryDelaysMs: [] })
    await vi.waitFor(() =>{  expect(remote.calls).toBe(1) })
    // Same key: no second push.
    emit()
    await Promise.resolve()
    expect(remote.calls).toBe(1)
    // Identity change triggers another push.
    state.identity = 'tenant:b'
    emit()
    await vi.waitFor(() =>{  expect(remote.calls).toBe(2) })
    // Locale change triggers another push.
    state.language = 'en-US'
    emit()
    await vi.waitFor(() =>{  expect(remote.calls).toBe(3) })
    runner.dispose()
  })

  it('logs a Remote failure and keeps the bundled roster', async () => {
    const state = { configured: true, identity: 'tenant:user', language: 'zh-CN' }
    const { adapter } = fakeAdapter(state)
    const { client } = fakeClient()
    const log = vi.fn()
    const runner = startExpertCatalogSync({
      adapter,
      resolveRemote: () => ({
        syncSdkworkCatalog: async () => ({ ok: false as const, error: { message: 'offline' } }),
        syncSdkworkPersonas: async () => ({ ok: true as const, value: { count: 0 } }),
      }),
      readClient: () => client,
      retryDelaysMs: [],
      log,
    })
    expect(await runner.syncNow()).toBeUndefined()
    await vi.waitFor(() =>{  expect(log).toHaveBeenCalled() })
    expect(String(log.mock.calls[0]?.[0])).toContain('keeping the bundled roster')
    expect(log.mock.calls[0]?.[1]).toBeInstanceOf(Error)
    runner.dispose()
  })

  it('stops notifying after dispose', async () => {
    const state = { configured: true, identity: 'tenant:user', language: 'zh-CN' }
    const { adapter, emit } = fakeAdapter(state)
    const remote = fakeRemote()
    const { client } = fakeClient()
    const runner = startExpertCatalogSync({ adapter, resolveRemote: () => remote.remote, readClient: () => client, retryDelaysMs: [] })
    runner.dispose()
    emit()
    await Promise.resolve()
    expect(remote.calls).toBe(0)
  })
})
