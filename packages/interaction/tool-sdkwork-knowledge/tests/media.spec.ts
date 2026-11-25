/**
 * Host media adapters: Facebook, X and Douyin publish through their official
 * HTTP APIs. These specs drive each adapter against a local mock server so the
 * request shape, credential resolution and platform-error mapping stay
 * observable without a live platform account.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  loadMediaAccounts,
  MediaPublishError,
  publishToHostPlatform,
  type HostMediaAccount,
  type MediaAdapterDeps,
} from '../src/media.ts'

/** One captured request. */
interface Captured {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: Buffer
}

/** A running mock platform server. */
interface Mock {
  baseUrl: string
  captured: Captured[]
  close: () => Promise<void>
}

/** Start a server that answers every request through `handler`. */
async function mockPlatform(
  handler: (request: Captured, response: ServerResponse) => void | Promise<void>,
): Promise<Mock> {
  const captured: Captured[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const entry: Captured = {
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        headers: request.headers,
        body: Buffer.concat(chunks),
      }
      captured.push(entry)
      void handler(entry, response)
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server did not bind a port')
  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    captured,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    }),
  }
}

/** Answer one request with a JSON body. */
function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

/** Adapter deps over the real fetch and fs, for multipart and file reads. */
const DEPS: MediaAdapterDeps = { fetch, readFile }

/** Directories created by a test, removed afterwards. */
const created: string[] = []

afterEach(async () => {
  for (const directory of created.splice(0)) await rm(directory, { recursive: true, force: true })
})

afterAll(() => {
  delete process.env.SDKWORK_MEDIA_ACCOUNTS_FILE
})

/** One Facebook Page account pointed at a mock base URL. */
function facebookAccount(baseUrl: string): HostMediaAccount {
  return { id: 'fb-1', platform: 'facebook', name: 'Page', pageId: 'page-1', accessToken: 'token-fb', apiBaseUrl: baseUrl }
}

/** One X account pointed at a mock base URL. */
function twitterAccount(baseUrl: string): HostMediaAccount {
  return { id: 'x-1', platform: 'twitter', name: '@brand', accessToken: 'token-x', apiBaseUrl: baseUrl }
}

/** One Douyin account pointed at a mock base URL. */
function douyinAccount(baseUrl: string): HostMediaAccount {
  return { id: 'dy-1', platform: 'douyin', name: '抖音号', openId: 'open-1', accessToken: 'token-dy', apiBaseUrl: baseUrl }
}

/** Write one temporary video file and return its path. */
async function videoFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-media-'))
  created.push(directory)
  const path = join(directory, 'clip.mp4')
  await writeFile(path, Buffer.from('fake-video-bytes'))
  return path
}

describe('facebook adapter', () => {
  it('posts text and a link to the Page feed', async () => {
    const server = await mockPlatform((request, response) => {
      json(response, 200, { id: 'post-1' })
    })
    try {
      const receipt = await publishToHostPlatform(
        facebookAccount(server.baseUrl),
        { text: 'Hello Page', link: 'https://example.com/launch' },
        {},
        DEPS,
      )
      expect(receipt.remoteIds).toEqual(['post-1'])
      const request = server.captured[0]
      expect(request?.method).toBe('POST')
      expect(request?.url).toBe('/page-1/feed')
      const body = new URLSearchParams(request?.body.toString() ?? '')
      expect(body.get('message')).toBe('Hello Page')
      expect(body.get('link')).toBe('https://example.com/launch')
      expect(body.get('access_token')).toBe('token-fb')
    } finally {
      await server.close()
    }
  })

  it('uploads a photo when an image path is given', async () => {
    const server = await mockPlatform((request, response) => {
      json(response, 200, { id: 'photo-1', post_id: 'post-2' })
    })
    const directory = await mkdtemp(join(tmpdir(), 'dsh-media-img-'))
    created.push(directory)
    const image = join(directory, 'cover.png')
    await writeFile(image, Buffer.from('png-bytes'))
    try {
      const receipt = await publishToHostPlatform(
        facebookAccount(server.baseUrl),
        { text: 'Photo caption', imagePaths: [image] },
        {},
        DEPS,
      )
      expect(receipt.remoteIds).toEqual(['post-2'])
      expect(server.captured[0]?.url).toBe('/page-1/photos')
      expect(server.captured[0]?.headers['content-type']).toContain('multipart/form-data')
    } finally {
      await server.close()
    }
  })

  it('reports the platform rejection message', async () => {
    const server = await mockPlatform((request, response) => {
      json(response, 400, { error: { message: 'Invalid OAuth access token', code: 190 } })
    })
    try {
      let failure: unknown
      try {
        await publishToHostPlatform(facebookAccount(server.baseUrl), { text: 'Hello' }, {}, DEPS)
      } catch (error) {
        failure = error
      }
      expect(failure).toMatchObject({ code: 'PLATFORM_REJECTED' })
      expect(String(failure)).toContain('Invalid OAuth access token')
    } finally {
      await server.close()
    }
  })
})

describe('twitter adapter', () => {
  it('creates a text post with the bearer token', async () => {
    const server = await mockPlatform((request, response) => {
      json(response, 201, { data: { id: 'tweet-1' } })
    })
    try {
      const receipt = await publishToHostPlatform(twitterAccount(server.baseUrl), { text: 'Hello X' }, {}, DEPS)
      expect(receipt.remoteIds).toEqual(['tweet-1'])
      const request = server.captured[0]
      expect(request?.url).toBe('/2/tweets')
      expect(request?.headers.authorization).toBe('Bearer token-x')
      expect(JSON.parse(request?.body.toString() ?? '{}')).toEqual({ text: 'Hello X' })
    } finally {
      await server.close()
    }
  })

  it('rejects a post over 280 characters', async () => {
    await expect(publishToHostPlatform(twitterAccount('http://127.0.0.1:9'), { text: 'x'.repeat(281) }, {}, DEPS))
      .rejects.toMatchObject({ code: 'TEXT_TOO_LONG' })
  })

  it('rejects media this adapter does not upload', async () => {
    await expect(publishToHostPlatform(
      twitterAccount('http://127.0.0.1:9'),
      { text: 'Hello', videoPath: '/tmp/clip.mp4' },
      {},
      DEPS,
    )).rejects.toMatchObject({ code: 'MEDIA_UNSUPPORTED' })
  })
})

describe('douyin adapter', () => {
  it('uploads the video and creates the post', async () => {
    const server = await mockPlatform((request, response) => {
      if (request.url.startsWith('/api/douyin/v1/video/upload_video/')) {
        json(response, 200, { data: { error_code: 0, video: { video_id: 'video-1' } } })
        return
      }
      json(response, 200, { data: { error_code: 0, item_id: 'item-1' } })
    })
    const video = await videoFile()
    try {
      const receipt = await publishToHostPlatform(douyinAccount(server.baseUrl), { text: 'New clip', videoPath: video }, {}, DEPS)
      expect(receipt.remoteIds).toEqual(['item-1'])
      expect(server.captured).toHaveLength(2)
      expect(server.captured[0]?.url).toContain('open_id=open-1')
      expect(server.captured[0]?.url).toContain('access_token=token-dy')
      expect(server.captured[0]?.headers['content-type']).toContain('multipart/form-data')
      expect(JSON.parse(server.captured[1]?.body.toString() ?? '{}')).toMatchObject({
        open_id: 'open-1',
        video_id: 'video-1',
        text: 'New clip',
      })
    } finally {
      await server.close()
    }
  })

  it('requires a video file', async () => {
    await expect(publishToHostPlatform(douyinAccount('http://127.0.0.1:9'), { text: 'caption' }, {}, DEPS))
      .rejects.toMatchObject({ code: 'VIDEO_REQUIRED' })
  })
})

describe('credential resolution', () => {
  it('reads the token from the named environment variable', async () => {
    const server = await mockPlatform((request, response) => {
      json(response, 201, { data: { id: 'tweet-env' } })
    })
    const account: HostMediaAccount = {
      id: 'x-env',
      platform: 'twitter',
      name: '@env',
      accessTokenEnv: 'TEST_MEDIA_TOKEN',
      apiBaseUrl: server.baseUrl,
    }
    try {
      const receipt = await publishToHostPlatform(account, { text: 'Hello' }, { TEST_MEDIA_TOKEN: 'token-from-env' }, DEPS)
      expect(receipt.remoteIds).toEqual(['tweet-env'])
      expect(server.captured[0]?.headers.authorization).toBe('Bearer token-from-env')
    } finally {
      await server.close()
    }
  })

  it('reports a missing token without leaking a value', async () => {
    const account: HostMediaAccount = {
      id: 'x-missing',
      platform: 'twitter',
      name: '@missing',
      accessTokenEnv: 'TEST_MEDIA_ABSENT',
    }
    let failure: unknown
    try {
      await publishToHostPlatform(account, { text: 'Hello' }, {}, DEPS)
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'MISSING_CREDENTIAL' })
    expect(String(failure)).toContain('TEST_MEDIA_ABSENT')
  })
})

describe('media account file', () => {
  it('returns no account when the file is absent', async () => {
    process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = join(tmpdir(), `absent-${String(Date.now())}.json`)
    await expect(loadMediaAccounts()).resolves.toEqual([])
  })

  it('loads and validates configured accounts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-media-config-'))
    created.push(directory)
    const path = join(directory, 'media-accounts.json')
    await writeFile(path, JSON.stringify({
      accounts: [
        { id: 'fb-1', platform: 'facebook', name: 'Page', pageId: 'p1', accessTokenEnv: 'FB_TOKEN' },
        { id: 'dy-1', platform: 'douyin', name: '抖音', openId: 'o1', accessTokenEnv: 'DY_TOKEN' },
      ],
    }))
    process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = path
    const accounts = await loadMediaAccounts()
    expect(accounts).toHaveLength(2)
    expect(accounts[0]).toMatchObject({ id: 'fb-1', platform: 'facebook', pageId: 'p1' })
  })

  it('rejects a malformed file instead of reading it as no account', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-media-bad-'))
    created.push(directory)
    const path = join(directory, 'media-accounts.json')
    await writeFile(path, '{not json')
    process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = path
    await expect(loadMediaAccounts()).rejects.toBeInstanceOf(MediaPublishError)
  })

  it('rejects an account for a platform without a Host adapter', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-media-platform-'))
    created.push(directory)
    const path = join(directory, 'media-accounts.json')
    await writeFile(path, JSON.stringify({ accounts: [{ id: 't-1', platform: 'toutiao', name: '头条' }] }))
    process.env.SDKWORK_MEDIA_ACCOUNTS_FILE = path
    await expect(loadMediaAccounts()).rejects.toMatchObject({ code: 'ACCOUNT_FILE_INVALID' })
  })
})
