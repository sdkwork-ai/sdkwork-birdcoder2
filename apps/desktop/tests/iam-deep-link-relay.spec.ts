import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createIamDeepLinkRelay, IAM_DEEP_LINK_RELAY_HEADER, IAM_DEEP_LINK_SPOOL_TTL_MS,
  type IamDeepLinkRelay,
} from '../src/iam-deep-link-relay.ts'

const CALLBACK = 'birdcoder://auth/callback?code=abc&state=s'

const directories: string[] = []

/** A private shared directory for one case. */
async function temporary(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-iam-relay-'))
  directories.push(directory)
  return directory
}

/** Whether a URL is the fixture callback. */
function isCallback(url: string): boolean {
  return url.startsWith('birdcoder://auth/callback')
}

/** Start one relay over a shared directory. */
async function relayAt(directory: string, deliver = vi.fn(), now = Date.now): Promise<IamDeepLinkRelay> {
  const relay = createIamDeepLinkRelay({
    identity: 'birdcoder',
    isCallback,
    deliver,
    directory,
    now,
  })
  await relay.start()
  return relay
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => { await rm(directory, { recursive: true, force: true }) }))
})

describe('createIamDeepLinkRelay', () => {
  it('broadcasts a callback to peer instances but not to the source', async () => {
    const directory = await temporary()
    const receivedA = vi.fn()
    const receivedB = vi.fn()
    const a = await relayAt(directory, receivedA)
    const b = await relayAt(directory, receivedB)
    a.share(CALLBACK)
    await vi.waitFor(() => { expect(receivedB).toHaveBeenCalledWith(CALLBACK) })
    expect(receivedA).not.toHaveBeenCalled()
    await a.dispose()
    await b.dispose()
  })

  it('spools a callback for an instance that starts afterwards', async () => {
    const directory = await temporary()
    const first = await relayAt(directory)
    first.share(CALLBACK)
    await vi.waitFor(async () => {
      expect((await readdir(join(directory, 'spool'))).length).toBeGreaterThan(0)
    })
    const received = vi.fn()
    const late = await relayAt(directory, received)
    expect(received).toHaveBeenCalledWith(CALLBACK)
    await first.dispose()
    await late.dispose()
  })

  it('rejects unauthenticated, foreign, and oversized relay requests', async () => {
    const directory = await temporary()
    const deliver = vi.fn()
    const relay = await relayAt(directory, deliver)
    const endpoint = relay.endpoint()
    expect(endpoint).toBeDefined()
    const url = endpoint as string

    expect((await fetch(url, { method: 'POST', body: JSON.stringify({ url: CALLBACK }) })).status).toBe(403)
    expect((await fetch(url, {
      method: 'GET',
      headers: { [IAM_DEEP_LINK_RELAY_HEADER]: 'wrong' },
    })).status).toBe(403)
    const token = await tokenOf(directory)
    expect((await fetch(url, {
      method: 'POST',
      headers: { [IAM_DEEP_LINK_RELAY_HEADER]: token },
      body: JSON.stringify({ url: 'birdcoder://open' }),
    })).status).toBe(400)
    expect((await fetch(url, {
      method: 'POST',
      headers: { [IAM_DEEP_LINK_RELAY_HEADER]: token },
      body: JSON.stringify({ url: `${CALLBACK}&pad=${'x'.repeat(9000)}` }),
    })).status).toBe(413)
    expect(deliver).not.toHaveBeenCalled()

    expect((await fetch(url, {
      method: 'POST',
      headers: { [IAM_DEEP_LINK_RELAY_HEADER]: token },
      body: JSON.stringify({ url: CALLBACK }),
    })).status).toBe(204)
    expect(deliver).toHaveBeenCalledWith(CALLBACK)
    await relay.dispose()
  })

  it('drops spool entries past the sign-in window', async () => {
    const directory = await temporary()
    const spool = join(directory, 'spool')
    await mkdir(spool, { recursive: true })
    const stale = { url: CALLBACK, at: Date.now() - IAM_DEEP_LINK_SPOOL_TTL_MS - 1000 }
    await writeFile(join(spool, 'stale.json'), JSON.stringify(stale))
    const deliver = vi.fn()
    const relay = await relayAt(directory, deliver)
    expect(deliver).not.toHaveBeenCalled()
    expect(await readdir(spool)).toEqual([])
    await relay.dispose()
  })

  it('removes its registry entry and closes the listener on dispose', async () => {
    const directory = await temporary()
    const relay = await relayAt(directory)
    const endpoint = relay.endpoint() as string
    expect((await readdir(directory)).some(name => name.endsWith('.json'))).toBe(true)
    await relay.dispose()
    expect((await readdir(directory)).filter(name => name.endsWith('.json'))).toEqual([])
    await expect(fetch(endpoint, { method: 'POST' })).rejects.toThrow()
  })

  it('ignores a URL that is not the registered callback', async () => {
    const directory = await temporary()
    const deliver = vi.fn()
    const relay = await relayAt(directory, deliver)
    relay.share('birdcoder://open')
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    expect(deliver).not.toHaveBeenCalled()
    await expect(readdir(join(directory, 'spool'))).rejects.toThrow()
    await relay.dispose()
  })
})

/** Read the token out of the one registry entry this process published. */
async function tokenOf(directory: string): Promise<string> {
  const names = (await readdir(directory)).filter(name => name.endsWith('.json'))
  const text = await readFile(join(directory, names[0] as string), 'utf8')
  return (JSON.parse(text) as { token: string }).token
}
