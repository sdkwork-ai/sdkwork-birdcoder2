import { describe, expect, it, vi } from 'vitest'
import {
  createKnowledgeBaseCatalog,
  KNOWLEDGE_TOP_K,
  type KnowledgeBaseAppClient,
  type KnowledgeBaseRecord,
} from '../src/client/knowledgeCatalog.ts'

/** Fake generated client recording every retrieval request. */
function client(hits: readonly { title?: string; content?: string }[] = []) {
  const create = vi.fn(async () => ({ hits }))
  const value: KnowledgeBaseAppClient = { knowledge: { retrievals: { create } } }
  return { value, create }
}

const records: readonly KnowledgeBaseRecord[] = [
  { id: '11', name: 'Team Handbook', type: 'team', count: 12 },
  { id: '0', name: 'Broken zero id', type: 'team' },
  { id: ' 22 ', name: '  Personal Notes  ', type: 'personal' },
  { id: '33', name: '', type: 'team' },
  { id: '', name: 'No id', type: 'team' },
  { id: '44', name: 'Unknown group', type: 'circle' },
  { id: '55', name: 'Negative count', type: 'personal', count: -1 },
  { id: '66', name: 'Non numeric count', type: 'team', count: Number.NaN },
]

describe('knowledge base catalog listing', () => {
  it('keeps selectable rows in application order and drops unusable entries', async () => {
    const catalog = createKnowledgeBaseCatalog({
      listBases: async () => records,
      client: () => client().value,
    })
    await expect(catalog.list(new AbortController().signal)).resolves.toEqual([
      { id: '11', name: 'Team Handbook', kind: 'team', documentCount: 12 },
      { id: '22', name: 'Personal Notes', kind: 'personal' },
      { id: '55', name: 'Negative count', kind: 'personal' },
      { id: '66', name: 'Non numeric count', kind: 'team' },
    ])
  })

  it('rejects without waiting when the caller already aborted', async () => {
    const listBases = vi.fn(async () => records)
    const catalog = createKnowledgeBaseCatalog({ listBases, client: () => client().value })
    const controller = new AbortController()
    controller.abort()
    await expect(catalog.list(controller.signal)).rejects.toThrow()
    expect(listBases).not.toHaveBeenCalled()
  })

  it('rejects when the caller aborts while the projection is loading', async () => {
    const controller = new AbortController()
    const catalog = createKnowledgeBaseCatalog({
      listBases: async () => {
        controller.abort()
        return records
      },
      client: () => client().value,
    })
    await expect(catalog.list(controller.signal)).rejects.toThrow()
  })
})

describe('knowledge base catalog retrieval', () => {
  it('skips the request for a blank query or no selected space', async () => {
    const fake = client()
    const catalog = createKnowledgeBaseCatalog({ listBases: async () => [], client: () => fake.value })
    const signal = new AbortController().signal
    await expect(catalog.retrieve('   ', ['11'], signal)).resolves.toEqual([])
    await expect(catalog.retrieve('how do we deploy?', [], signal)).resolves.toEqual([])
    expect(fake.create).not.toHaveBeenCalled()
  })

  it('maps usable hits, drops blank ones, and bounds the result', async () => {
    const hits = Array.from({ length: KNOWLEDGE_TOP_K + 2 }, (_, index) => ({
      title: `Title ${index}`,
      content: `Content ${index}`,
    }))
    const fake = client([{ title: '  ' }, ...hits])
    const catalog = createKnowledgeBaseCatalog({ listBases: async () => [], client: () => fake.value })
    const signal = new AbortController().signal

    const excerpts = await catalog.retrieve('deploy steps', ['11', '22'], signal)

    expect(excerpts).toHaveLength(KNOWLEDGE_TOP_K)
    expect(excerpts[0]).toEqual({ title: 'Title 0', content: 'Content 0' })
    expect(fake.create).toHaveBeenCalledWith({
      query: 'deploy steps',
      bindings: [
        { spaceId: '11', priority: 0, topK: KNOWLEDGE_TOP_K },
        { spaceId: '22', priority: 0, topK: KNOWLEDGE_TOP_K },
      ],
      topK: KNOWLEDGE_TOP_K,
      includeCitations: true,
      includeTrace: false,
    }, { signal })
  })

  it('tolerates a result frame without hits', async () => {
    const create = vi.fn(async () => ({}))
    const catalog = createKnowledgeBaseCatalog({
      listBases: async () => [],
      client: () => ({ knowledge: { retrievals: { create } } }),
    })
    await expect(catalog.retrieve('anything', ['11'], new AbortController().signal)).resolves.toEqual([])
  })

  it('propagates an abort raised while the request is in flight', async () => {
    const controller = new AbortController()
    const create = vi.fn(async () => {
      controller.abort()
      return { hits: [] }
    })
    const catalog = createKnowledgeBaseCatalog({
      listBases: async () => [],
      client: () => ({ knowledge: { retrievals: { create } } }),
    })
    await expect(catalog.retrieve('anything', ['11'], controller.signal)).rejects.toThrow()
  })
})
