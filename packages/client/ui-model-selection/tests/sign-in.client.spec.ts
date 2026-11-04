/**
 * The shared sign-in gate: which catalog groups are a sign-in preview, and how
 * a completed sign-in becomes a selectable model.
 */
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelDirectoryState } from '../src/client/directory.ts'
import { requiresSignIn, waitForSignedInModel } from '../src/client/sign-in.ts'

/** One directory snapshot with a BirdCoder preview and an ordinary route. */
function state(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'birdcoder', model: 'deepseek/deepseek-v4-pro' },
    routable: null,
    groups: [
      {
        id: 'birdcoder',
        name: 'BirdCoder',
        requiresSignIn: true,
        models: [{ id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' }],
      },
      {
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
      },
    ],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  }
}

/** A directory whose snapshot the test can move. */
function directoryOf(initial: ModelDirectoryState) {
  const store = createSnapshotStore(initial)
  const refresh = vi.fn(async () => store.getSnapshot())
  return { store, refresh }
}

describe('model selection sign-in gate', () => {
  it('marks only advertised sign-in previews', () => {
    const snapshot = state()
    expect(requiresSignIn(snapshot, { provider: 'birdcoder', model: 'deepseek/deepseek-v4-pro' })).toBe(true)
    // An ordinary route and an unknown route are the Host's business, not the gate's.
    expect(requiresSignIn(snapshot, { provider: 'deepseek-official', model: 'deepseek-chat' })).toBe(false)
    expect(requiresSignIn(snapshot, { provider: 'missing', model: 'model' })).toBe(false)
    // A preview group lists only its own models.
    expect(requiresSignIn(snapshot, { provider: 'birdcoder', model: 'other' })).toBe(false)
  })

  it('returns as soon as the catalog republishes the route as selectable', async () => {
    const directory = directoryOf(state())
    directory.refresh.mockImplementation(async () => {
      const next = state({ groups: [
        { id: 'birdcoder', name: 'BirdCoder', models: [{ id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' }] },
      ] })
      directory.store.set(next)
      return next
    })
    await expect(waitForSignedInModel(directory, { provider: 'birdcoder', model: 'deepseek/deepseek-v4-pro' }, {
      timeoutMs: 1_000, pollMs: 1, refreshMs: 1,
    })).resolves.toBe(true)
    expect(directory.refresh).toHaveBeenCalled()
  })

  it('gives up when the credential never reaches the loaded catalog', async () => {
    const directory = directoryOf(state())
    await expect(waitForSignedInModel(directory, { provider: 'birdcoder', model: 'deepseek/deepseek-v4-pro' }, {
      timeoutMs: 5, pollMs: 1, refreshMs: 1,
    })).resolves.toBe(false)
  })

  it('waits for a model that is not advertised at all until the Host lists it', async () => {
    const directory = directoryOf(state({ groups: [] }))
    directory.refresh.mockImplementation(async () => {
      if (directory.refresh.mock.calls.length < 2) return directory.store.getSnapshot()
      const next = state({ groups: [
        { id: 'birdcoder', name: 'BirdCoder', models: [{ id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro' }] },
      ] })
      directory.store.set(next)
      return next
    })
    await expect(waitForSignedInModel(directory, { provider: 'birdcoder', model: 'deepseek/deepseek-v4-pro' }, {
      timeoutMs: 1_000, pollMs: 1, refreshMs: 1,
    })).resolves.toBe(true)
  })
})
