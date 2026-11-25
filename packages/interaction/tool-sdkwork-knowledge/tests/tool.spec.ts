/**
 * `sdkwork_knowledge_write` and `sdkwork_content_publish` relay one knowledge or
 * media operation from the conversation.
 *
 * The Host validates the arguments, embeds a local cover image, and relays a
 * scoped `sdkwork-knowledge/request` waterfall to the connected client, which
 * owns the IAM session and the generated Knowledge Base app client. The client
 * writes the article or publishes through the platform account and answers with
 * the facts the tool returns.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import * as KnowledgeTool from '../src/index.ts'
import type { SdkworkKnowledgeRequestEvent, SdkworkKnowledgeResult } from '../src/types.ts'

/** 1x1 transparent PNG, enough for the cover MIME and base64 path. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** One knowledge answer the fixture client returns. */
const SPACES: SdkworkKnowledgeResult = {
  ok: true,
  status: 'ok',
  action: 'spaces.list',
  spaces: [{ id: '7', name: 'Product', kind: 'team', documentCount: 3 }],
}

/** Directories created by one test, removed afterwards. */
const created: string[] = []

/** Environment value this spec overrides, restored after each test. */
const originalAccountsFile = process.env.SDKWORK_MEDIA_ACCOUNTS_FILE

beforeEach(() => {
  process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = join(tmpdir(), `dsh-knowledge-absent-${String(Date.now())}-${String(Math.random())}.json`)
})

afterEach(async () => {
  if (originalAccountsFile === undefined) delete process.env.SDKWORK_MEDIA_ACCOUNTS_FILE
  else process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = originalAccountsFile
  for (const directory of created.splice(0)) await rm(directory, { recursive: true, force: true })
})

/** Minimal live Agent stub; the relay only needs an identity and a Session cwd. */
function fakeAgent(directory: string): Agent {
  return { id: 'agent-1', session: { header: { cwd: directory } } } as unknown as Agent
}

/**
 * Boot both tools over a real tool runtime and register one client answerer.
 * @param answer - the client's answer for every request it receives.
 * @param directory - the Session working directory.
 * @returns the booted context, observed requests, and the call helper.
 */
async function bench(
  answer: (request: SdkworkKnowledgeRequestEvent) => Promise<SdkworkKnowledgeResult> | SdkworkKnowledgeResult,
  directory = process.cwd(),
): Promise<{
  ctx: Context
  requests: SdkworkKnowledgeRequestEvent[]
  execute: (name: string, args: Record<string, unknown>) => ReturnType<typeof executeToolFixture>
}> {
  const ctx = new Context()
  provideWorkingDirectoryFixture(ctx, directory)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalFileSystem)
  await ctx.plugin(KnowledgeTool)
  const requests: SdkworkKnowledgeRequestEvent[] = []
  ctx.on('sdkwork-knowledge/request', async (request) => {
    requests.push(request)
    return answer(request)
  })
  const agent = fakeAgent(directory)
  let callNumber = 0
  const execute = (name: string, args: Record<string, unknown>) => executeToolFixture(ctx, {
    signal: new AbortController().signal,
    callId: `call-${++callNumber}` as ToolCallId,
    name,
    arguments: args,
    agent,
  })
  return { ctx, requests, execute }
}

/** Write one temporary cover file and return its path. */
async function coverFile(): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-knowledge-cover-'))
  created.push(directory)
  const path = join(directory, 'cover.png')
  await writeFile(path, PNG_1X1)
  return { directory, path }
}

describe('sdkwork_knowledge_write', () => {
  it('registers both knowledge tools', async () => {
    const { ctx } = await bench(() => SPACES)
    expect(ctx.tools.get('sdkwork_knowledge_write')).toBeDefined()
    expect(ctx.tools.get('sdkwork_content_publish')).toBeDefined()
  })

  it('relays a space listing and returns its spaces', async () => {
    const { requests, execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_knowledge_write', { action: 'list_spaces' })
    expect(result.isError).toBe(false)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.action).toBe('spaces.list')
    if (result.isError) throw new Error('listing failed')
    expect(result.value).toMatchObject({ ok: true, spaces: [{ id: '7', name: 'Product' }] })
  })

  it('trims an article request before relaying it', async () => {
    const { requests, execute } = await bench(() => ({
      ok: true,
      status: 'ok',
      action: 'articles.create',
      article: { documentId: '9', title: 'Release notes', spaceId: '7', state: 'succeeded' },
    }))
    const result = await execute('sdkwork_knowledge_write', {
      action: 'create_article',
      spaceId: ' 7 ',
      title: ' Release notes ',
      markdown: ' # Release notes\n\nBody ',
      visibility: 'space',
    })
    expect(result.isError).toBe(false)
    expect(requests[0]).toMatchObject({
      action: 'articles.create',
      spaceId: '7',
      title: 'Release notes',
      markdown: '# Release notes\n\nBody',
      visibility: 'space',
    })
    if (result.isError) throw new Error('write failed')
    expect(result.value).toMatchObject({ ok: true, article: { documentId: '9' } })
  })

  it('rejects a blank title before relaying', async () => {
    const { requests, execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_knowledge_write', {
      action: 'create_article',
      spaceId: '7',
      title: '   ',
      markdown: 'body',
    })
    expect(result.isError).toBe(true)
    expect(requests).toHaveLength(0)
  })

  it('rejects a title over the platform limit', async () => {
    const { execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_knowledge_write', {
      action: 'create_article',
      spaceId: '7',
      title: '题'.repeat(65),
      markdown: 'body',
    })
    expect(result.isError).toBe(true)
  })
})

describe('sdkwork_content_publish', () => {
  it('embeds a local cover image as a data URI before relaying', async () => {
    const { directory, path } = await coverFile()
    const { requests, execute } = await bench(() => ({
      ok: true,
      status: 'ok',
      action: 'media.publish',
      receipt: {
        platform: 'wechat-official-account',
        accepted: true,
        status: 'accepted',
        mode: 'publish',
        accountIds: ['acc-1'],
        titles: ['Release notes'],
      },
    }), directory)
    const result = await execute('sdkwork_content_publish', {
      action: 'publish',
      accountIds: ['acc-1'],
      title: 'Release notes',
      author: 'Platform team',
      summary: 'What changed',
      contentHtml: '<p>Body</p>',
      coverPath: path,
    })
    expect(result.isError).toBe(false)
    const request = requests[0]
    expect(request?.action).toBe('media.publish')
    const cover = request?.articles?.[0]?.cover ?? ''
    expect(cover.startsWith('data:image/png;base64,')).toBe(true)
    expect(cover.length).toBeGreaterThan('data:image/png;base64,'.length)
    expect(request?.articles?.[0]).toMatchObject({
      title: 'Release notes',
      author: 'Platform team',
      summary: 'What changed',
      contentHtml: '<p>Body</p>',
    })
    expect(request?.mode).toBe('publish')
  })

  it('relays a draft mode without a live publication', async () => {
    const { requests, execute } = await bench(() => ({
      ok: true,
      status: 'ok',
      action: 'media.publish',
      receipt: {
        platform: 'wechat-official-account',
        accepted: true,
        status: 'accepted',
        mode: 'draft',
        accountIds: ['acc-1'],
        titles: ['Draft'],
      },
    }))
    const result = await execute('sdkwork_content_publish', {
      action: 'publish',
      mode: 'draft',
      accountIds: [' acc-1 '],
      title: 'Draft',
      author: 'Platform team',
      contentHtml: '<p>Body</p>',
      coverMediaId: 'media-1',
    })
    expect(result.isError).toBe(false)
    expect(requests[0]).toMatchObject({ action: 'media.publish', mode: 'draft', accountIds: ['acc-1'] })
    expect(requests[0]?.articles?.[0]?.cover).toBe('media-1')
  })

  it('requires exactly one cover source', async () => {
    const { directory, path } = await coverFile()
    const { execute } = await bench(() => SPACES, directory)
    const result = await execute('sdkwork_content_publish', {
      action: 'publish',
      accountIds: ['acc-1'],
      title: 'Release notes',
      author: 'Platform team',
      contentHtml: '<p>Body</p>',
      coverPath: path,
      coverMediaId: 'media-1',
    })
    expect(result.isError).toBe(true)
  })

  it('requires a cover for a WeChat article', async () => {
    const { execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_content_publish', {
      action: 'publish',
      accountIds: ['acc-1'],
      title: 'Release notes',
      author: 'Platform team',
      contentHtml: '<p>Body</p>',
    })
    expect(result.isError).toBe(true)
  })

  it('reports the capability matrix with the configured state of each platform', async () => {
    const { execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_content_publish', { action: 'capabilities' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('capability check failed')
    const capabilities = (result.value as { capabilities?: { platform: string; status: string }[] }).capabilities ?? []
    expect(capabilities).toHaveLength(6)
    expect(capabilities.find(row => row.platform === 'wechat-official-account')?.status).toBe('account-required')
    expect(capabilities.find(row => row.platform === 'facebook')?.status).toBe('account-required')
    expect(capabilities.find(row => row.platform === 'toutiao')?.status).toBe('account-required')
  })

  it('publishes to a Host platform through its configured adapter', async () => {
    const requests: { method?: string; url?: string }[] = []
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url })
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ id: 'post-1' }))
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('mock server did not bind')
    const directory = await mkdtemp(join(tmpdir(), 'dsh-knowledge-media-'))
    created.push(directory)
    const accountsPath = join(directory, 'media-accounts.json')
    await writeFile(accountsPath, JSON.stringify({
      accounts: [{
        id: 'fb-1',
        platform: 'facebook',
        name: 'Page',
        pageId: 'page-1',
        accessToken: 'token-fb',
        apiBaseUrl: `http://127.0.0.1:${String(address.port)}`,
      }],
    }))
    process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = accountsPath
    try {
      const { execute } = await bench(() => SPACES)
      const result = await execute('sdkwork_content_publish', {
        action: 'publish',
        platform: 'facebook',
        accountIds: ['fb-1'],
        text: 'Hello Page',
      })
      expect(result.isError).toBe(false)
      if (result.isError) throw new Error('publish failed')
      expect(result.value).toMatchObject({
        ok: true,
        receipt: { platform: 'facebook', accepted: true, mode: 'publish', accountIds: ['fb-1'] },
      })
      expect(requests).toEqual([{ method: 'POST', url: '/page-1/feed' }])
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    }
  })

  it('lists the accounts of a Host platform', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-knowledge-accounts-'))
    created.push(directory)
    const accountsPath = join(directory, 'media-accounts.json')
    await writeFile(accountsPath, JSON.stringify({
      accounts: [
        { id: 'x-1', platform: 'twitter', name: '@brand', accessTokenEnv: 'X_TOKEN' },
        { id: 'fb-1', platform: 'facebook', name: 'Page', pageId: 'p1', accessTokenEnv: 'FB_TOKEN' },
      ],
    }))
    process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = accountsPath
    const { execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_content_publish', { action: 'accounts', platform: 'twitter' })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('account listing failed')
    expect(result.value).toMatchObject({
      ok: true,
      accounts: [{ id: 'x-1', name: '@brand', platform: 'twitter' }],
    })
  })

  it('reports a platform without an adapter instead of publishing', async () => {
    const { execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_content_publish', {
      action: 'publish',
      platform: 'toutiao',
      accountIds: ['t-1'],
      text: 'Hello',
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('unsupported platform should be a reported failure')
    expect(result.value).toMatchObject({ ok: false, stage: 'publish', code: 'PLATFORM_NOT_CONFIGURED' })
  })

  it('rejects a preview without recipient ids', async () => {
    const { execute } = await bench(() => SPACES)
    const result = await execute('sdkwork_content_publish', {
      action: 'preview',
      accountIds: ['acc-1'],
      title: 'Preview',
      author: 'Platform team',
      contentHtml: '<p>Body</p>',
      coverMediaId: 'media-1',
    })
    expect(result.isError).toBe(true)
  })

  it('fails with NO_CLIENT when no browser client answers', async () => {
    const ctx = new Context()
    const directory = await mkdtemp(join(tmpdir(), 'dsh-knowledge-noclient-'))
    created.push(directory)
    provideWorkingDirectoryFixture(ctx, directory)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(NativeToolExecutor)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(LocalFileSystem)
    await ctx.plugin(KnowledgeTool)
    const result = await executeToolFixture(ctx, {
      signal: new AbortController().signal,
      callId: 'call-1' as ToolCallId,
      name: 'sdkwork_knowledge_write',
      arguments: { action: 'list_spaces' },
      agent: fakeAgent(directory),
    })
    expect(result.isError).toBe(true)
    if (!result.isError) throw new Error('expected a relay failure')
    expect(result.error.info?.code).toBe('NO_CLIENT')
  })
})

describe('describeResult', () => {
  it('renders the spaces it wrote to', () => {
    const text = KnowledgeTool.describeResult({
      ok: true,
      status: 'ok',
      action: 'articles.create',
      article: { documentId: '12', title: 'Launch', spaceId: '7', state: 'succeeded' },
    })
    expect(text).toContain('Wrote "Launch" in space 7: document 12')
  })

  it('renders the capability matrix with its requirement', () => {
    const text = KnowledgeTool.describeResult({
      ok: true,
      status: 'ok',
      action: 'media.capabilities',
      capabilities: [
        {
          platform: 'douyin',
          label: 'Douyin',
          status: 'account-required',
          contentKinds: ['short-video'],
          requirement: 'A Douyin creator authorization.',
          limits: [],
          notes: 'A text article does not fit this platform.',
        },
      ],
    })
    expect(text).toContain('Douyin (douyin): account-required')
    expect(text).toContain('content: short-video')
    expect(text).toContain('note: A text article does not fit this platform.')
  })

  it('renders a publish receipt with the asynchronous note', () => {
    const text = KnowledgeTool.describeResult({
      ok: true,
      status: 'ok',
      action: 'media.publish',
      receipt: {
        platform: 'wechat-official-account',
        accepted: true,
        status: 'accepted',
        mode: 'publish',
        accountIds: ['acc-1'],
        titles: ['Launch'],
      },
    })
    expect(text).toContain('Published for wechat-official-account: accepted')
    expect(text).toContain('Publication completes asynchronously')
  })

  it('renders a failure as the stopping stage', () => {
    expect(KnowledgeTool.describeResult({
      ok: false,
      status: 'failed',
      action: 'media.publish',
      stage: 'publish',
      code: 'PLATFORM_NOT_CONFIGURED',
      message: 'Douyin has no publishing adapter',
    })).toBe('Knowledge operation failed at publish (PLATFORM_NOT_CONFIGURED): Douyin has no publishing adapter')
  })
})
