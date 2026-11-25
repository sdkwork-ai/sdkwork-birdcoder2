// @vitest-environment node
/**
 * The conversation bridge writes articles and publishes through the Knowledge
 * Base app client bound to the signed-in IAM session. These specs drive the
 * executor with a fake client so the request mapping, the space and account
 * projections, the ingest polling and the failure codes stay observable.
 */
import { describe, expect, it } from 'vitest'
import type { SdkworkKnowledgeRequestEvent } from '@deepseek-ai/dsh-tool-sdkwork-knowledge/types'
import {
  runKnowledgeConversation,
  type KnowledgeConversationClient,
  type KnowledgeConversationPorts,
} from '../src/client/knowledgeConversation.ts'

/** One document the fake listing returns. */
const DOCUMENT = { id: '41', title: 'Launch notes', spaceId: '7', contentState: 'ready' }

/** One official account the fake listing returns. */
const ACCOUNT = { id: 'acc-1', name: 'Product account', type: 'service', group: 'product' }

/** Recorded calls of one fake client. */
interface Recorded {
  ingests: { spaceId: string; title: string; payloadMarkdown?: string; idempotencyKey: string }[]
  polls: string[]
  updates: { documentId: string; body: { spaceId: string; title: string; visibility?: string } }[]
  publishes: unknown[]
  previews: unknown[]
  concepts: { spaceId: string; conceptId: string; markdown: string; publish: boolean }[]
}

/**
 * Build one fake generated client with recorded calls.
 * @param overrides - per-endpoint behavior overrides.
 * @returns the fake client and its recorded calls.
 */
function fakeClient(overrides: {
  accounts?: readonly { id: string; name: string; type?: string; description?: string; group?: string }[]
  ingestStates?: string[]
  documents?: readonly { id: string; title: string; spaceId: string; contentState?: string }[]
  publish?: () => Promise<{ accepted: boolean; status: string }>
  preview?: () => Promise<{ accepted: boolean; status: string }>
} = {}): { client: KnowledgeConversationClient; recorded: Recorded } {
  const recorded: Recorded = { ingests: [], polls: [], updates: [], publishes: [], previews: [], concepts: [] }
  const states = [...(overrides.ingestStates ?? ['queued', 'succeeded'])]
  let pollIndex = 0
  const client: KnowledgeConversationClient = {
    knowledge: {
      ingests: {
        async create(body) {
          recorded.ingests.push(body)
          return { id: 'ingest-1', state: states[0] ?? 'queued' }
        },
        async retrieve(ingestId) {
          recorded.polls.push(ingestId)
          pollIndex = Math.min(pollIndex + 1, states.length - 1)
          const state = states[pollIndex] ?? 'succeeded'
          return { id: ingestId, state, ...(state === 'failed' ? { errorMessage: 'extraction failed' } : {}) }
        },
      },
      documents: {
        async list() {
          return { items: [...(overrides.documents ?? [DOCUMENT])] }
        },
        async retrieve(documentId) {
          return { ...DOCUMENT, id: documentId }
        },
        content: {
          async list() {
            return { contentMarkdown: '# Launch notes\n\nBody' }
          },
        },
        async update(documentId, body) {
          recorded.updates.push({ documentId, body })
          return { id: documentId, title: body.title, spaceId: body.spaceId, contentState: 'ready' }
        },
      },
      okf: {
        concepts: {
          async update(body) {
            recorded.concepts.push(body)
            return {
              conceptId: body.conceptId,
              title: 'Wiki page',
              updatedAt: '2026-11-25T00:00:00.000Z',
            }
          },
        },
      },
      wechat: {
        officialAccounts: {
          async list() {
            return { items: [...(overrides.accounts ?? [])] }
          },
        },
        articles: {
          async publish(body) {
            recorded.publishes.push(body)
            if (overrides.publish !== undefined) return overrides.publish()
            return { accepted: true, status: 'accepted' }
          },
          async preview(body) {
            recorded.previews.push(body)
            if (overrides.preview !== undefined) return overrides.preview()
            return { accepted: true, status: 'validated' }
          },
        },
      },
    },
  }
  return { client, recorded }
}

/** Build one executor ports value over a fake client. */
function ports(client: KnowledgeConversationClient, options: {
  signedIn?: boolean
  bases?: readonly { id?: string; name?: string; type?: string; count?: number }[]
} = {}): KnowledgeConversationPorts {
  return {
    isSignedIn: () => options.signedIn ?? true,
    listBases: async () => options.bases ?? [],
    client: () => client,
    sleep: async () => { await Promise.resolve() },
  }
}

/** One relayed request with the required action. */
function request(action: SdkworkKnowledgeRequestEvent['action'], rest: Omit<SdkworkKnowledgeRequestEvent, 'action'> = {}): SdkworkKnowledgeRequestEvent {
  return { action, ...rest }
}

/** One article the publish tests send. */
const ARTICLE = {
  title: 'Launch notes',
  author: 'Platform team',
  contentHtml: '<p>Body</p>',
  summary: 'What changed',
  cover: 'data:image/png;base64,AAAA',
}

describe('knowledge conversation: signing in', () => {
  it('reports a signed-out session instead of calling the client', async () => {
    const { client } = fakeClient()
    const result = await runKnowledgeConversation(ports(client, { signedIn: false }), request('spaces.list'))
    expect(result).toMatchObject({ ok: false, stage: 'signedOut', code: 'SIGNED_OUT' })
  })
})

describe('knowledge conversation: spaces and articles', () => {
  it('lists spaces in application order and drops unaddressable rows', async () => {
    const { client } = fakeClient()
    const result = await runKnowledgeConversation(ports(client, {
      bases: [
        { id: '7', name: 'Product', type: 'team', count: 4 },
        { id: '0', name: 'Unresolved', type: 'team' },
        { id: '8', name: 'Private', type: 'personal' },
        { id: '9', name: 'Unknown group', type: 'shared' },
        { id: '10', name: '  ', type: 'team' },
      ],
    }), request('spaces.list'))
    expect(result).toMatchObject({
      ok: true,
      spaces: [
        { id: '7', name: 'Product', kind: 'team', documentCount: 4 },
        { id: '8', name: 'Private', kind: 'personal' },
      ],
    })
  })

  it('lists the documents of one space', async () => {
    const { client } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('articles.list', { spaceId: '7' }))
    expect(result).toMatchObject({
      ok: true,
      articles: [{ documentId: '41', title: 'Launch notes', spaceId: '7', state: 'ready' }],
    })
  })

  it('reads one article with its Markdown body', async () => {
    const { client } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('articles.read', { documentId: '41' }))
    expect(result).toMatchObject({
      ok: true,
      article: {
        documentId: '41',
        title: 'Launch notes',
        spaceId: '7',
        state: 'ready',
        markdown: '# Launch notes\n\nBody',
      },
    })
  })

  it('rejects an article request without a space id', async () => {
    const { client } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('articles.create', { title: 'x', markdown: 'y' }))
    expect(result).toMatchObject({ ok: false, stage: 'validate', code: 'INVALID_ARGS' })
  })
})

describe('knowledge conversation: writing an article', () => {
  it('ingests Markdown, polls the job and reads the document back', async () => {
    const { client, recorded } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('articles.create', {
      spaceId: '7',
      title: 'Launch notes',
      markdown: '# Launch\n\nBody',
    }))
    expect(result).toMatchObject({
      ok: true,
      article: { documentId: '41', title: 'Launch notes', spaceId: '7', state: 'ready' },
    })
    expect(recorded.ingests).toHaveLength(1)
    expect(recorded.ingests[0]).toMatchObject({
      spaceId: '7',
      title: 'Launch notes',
      payloadMarkdown: '# Launch\n\nBody',
    })
    expect(recorded.ingests[0]?.idempotencyKey).toMatch(/^article:7:[0-9a-f]{8}$/u)
    expect(recorded.polls).toEqual(['ingest-1'])
  })

  it('reports a failed ingestion instead of a written article', async () => {
    const { client } = fakeClient({ ingestStates: ['queued', 'failed'] })
    const result = await runKnowledgeConversation(ports(client), request('articles.create', {
      spaceId: '7',
      title: 'Launch notes',
      markdown: 'Body',
    }))
    expect(result).toMatchObject({ ok: false, stage: 'ingest', code: 'INGEST_FAILED', message: 'extraction failed' })
  })

  it('applies the requested visibility once the document exists', async () => {
    const { client, recorded } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('articles.create', {
      spaceId: '7',
      title: 'Launch notes',
      markdown: 'Body',
      visibility: 'public',
    }))
    expect(result).toMatchObject({ ok: true, article: { documentId: '41' } })
    expect(recorded.updates).toEqual([
      { documentId: '41', body: { spaceId: '7', title: 'Launch notes', visibility: 'public' } },
    ])
  })

  it('upserts a concept with a derived id and publication flag', async () => {
    const { client, recorded } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('concepts.upsert', {
      spaceId: '7',
      title: 'Launch Notes',
      markdown: '# Launch',
      publishConcept: true,
    }))
    expect(result).toMatchObject({
      ok: true,
      article: { conceptId: 'launch-notes', title: 'Wiki page', spaceId: '7', state: 'published' },
    })
    expect(recorded.concepts[0]).toEqual({
      spaceId: '7',
      conceptId: 'launch-notes',
      markdown: '# Launch',
      publish: true,
    })
  })

  it('derives a stable concept id for a title without latin characters', async () => {
    const { client, recorded } = fakeClient()
    await runKnowledgeConversation(ports(client), request('concepts.upsert', {
      spaceId: '7',
      title: '发布说明',
      markdown: '# 发布',
    }))
    expect(recorded.concepts[0]?.conceptId).toMatch(/^article-[0-9a-f]{8}$/u)
  })
})

describe('knowledge conversation: media accounts', () => {
  it('lists the WeChat accounts without exposing any secret', async () => {
    const { client } = fakeClient({ accounts: [ACCOUNT] })
    const result = await runKnowledgeConversation(ports(client), request('media.accounts'))
    expect(result).toMatchObject({
      ok: true,
      accounts: [{ id: 'acc-1', name: 'Product account', platform: 'wechat-official-account', accountType: 'service', group: 'product' }],
    })
    expect(JSON.stringify(result)).not.toContain('appSecret')
  })

  it('reports a platform without an account adapter', async () => {
    const { client } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('media.accounts', { platform: 'douyin' }))
    expect(result).toMatchObject({ ok: false, stage: 'accounts', code: 'PLATFORM_NOT_CONFIGURED' })
  })
})

describe('knowledge conversation: publishing', () => {
  it('publishes to the selected accounts and reports the receipt', async () => {
    const { client, recorded } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('media.publish', {
      platform: 'wechat-official-account',
      accountIds: ['acc-1'],
      articles: [ARTICLE],
      mode: 'publish',
    }))
    expect(result).toMatchObject({
      ok: true,
      receipt: {
        platform: 'wechat-official-account',
        accepted: true,
        status: 'accepted',
        mode: 'publish',
        accountIds: ['acc-1'],
        titles: ['Launch notes'],
      },
    })
    expect(recorded.publishes[0]).toMatchObject({
      accountIds: ['acc-1'],
      sendNotification: true,
      articles: [{
        title: 'Launch notes',
        author: 'Platform team',
        content: '<p>Body</p>',
        cover: 'data:image/png;base64,AAAA',
        abstract: 'What changed',
      }],
    })
  })

  it('saves a draft with notifications disabled', async () => {
    const { client, recorded } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('media.publish', {
      accountIds: ['acc-1'],
      articles: [ARTICLE],
      mode: 'draft',
    }))
    expect(result).toMatchObject({ ok: true, receipt: { mode: 'draft' } })
    expect(recorded.publishes[0]).toMatchObject({ sendNotification: false })
  })

  it('refuses a platform without a publishing adapter', async () => {
    const { client, recorded } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('media.publish', {
      platform: 'twitter',
      accountIds: ['x-1'],
      articles: [ARTICLE],
    }))
    expect(result).toMatchObject({ ok: false, stage: 'publish', code: 'PLATFORM_NOT_CONFIGURED' })
    expect(recorded.publishes).toHaveLength(0)
  })

  it('sends a preview from the first selected account', async () => {
    const { client, recorded } = fakeClient()
    const result = await runKnowledgeConversation(ports(client), request('media.preview', {
      accountIds: ['acc-1', 'acc-2'],
      wechatIds: ['openid-1'],
      articles: [ARTICLE],
    }))
    expect(result).toMatchObject({ ok: true, receipt: { mode: 'preview', accountIds: ['acc-1'] } })
    expect(recorded.previews[0]).toMatchObject({ accountId: 'acc-1', wechatIds: ['openid-1'] })
  })

  it('reports a platform rejection with its own code', async () => {
    const { client } = fakeClient({
      publish: async () => { throw Object.assign(new Error('publication is disabled for this deployment'), { code: 'WECHAT_DISABLED' }) },
    })
    const result = await runKnowledgeConversation(ports(client), request('media.publish', {
      accountIds: ['acc-1'],
      articles: [ARTICLE],
    }))
    expect(result).toMatchObject({ ok: false, stage: 'publish', code: 'WECHAT_DISABLED', message: 'publication is disabled for this deployment' })
  })
})
