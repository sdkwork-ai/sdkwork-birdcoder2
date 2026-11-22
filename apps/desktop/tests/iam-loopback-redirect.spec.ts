import { request } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIamLoopbackRedirect, type IamLoopbackRedirect } from '../src/iam-loopback-redirect.ts'

const active: IamLoopbackRedirect[] = []

afterEach(async () => {
  await Promise.all(active.splice(0).map(async (relay) => { await relay.dispose() }))
})

/** One raw GET so the test can set a forbidden `Host` header. */
function rawGet(url: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = request({
      host: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      headers,
    }, (response) => {
      response.resume()
      response.on('end', () => { resolve(response.statusCode ?? 0) })
    })
    req.on('error', reject)
    req.end()
  })
}

/** Fetch headers the browser sends on the authorization server's redirect. */
const NAVIGATION_HEADERS = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }

/** One callback response as the browser navigation observes it. */
interface NavigationResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  text(): Promise<string>
}

/**
 * One GET shaped like the browser navigation the callback arrives on.
 *
 * Node's `fetch` sends `Origin` and a CORS Fetch Metadata mode, which the
 * listener must reject; a navigation is a plain document request instead.
 * @param url - callback URL under test.
 * @param headers - extra request headers.
 * @returns the response status, headers, and complete body.
 */
function navigate(url: string, headers: Record<string, string> = {}): Promise<NavigationResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = request({
      host: parsed.hostname,
      port: parsed.port,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      headers: { host: parsed.host, ...NAVIGATION_HEADERS, ...headers },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => { chunks.push(Buffer.from(chunk)) })
      response.on('end', () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          text: async () => Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

/** One started listener. */
async function started(options: { timeoutMs?: number; brandName?: string } = {}): Promise<{
  redirect: IamLoopbackRedirect
  redirectUri: string
  onCallback: ReturnType<typeof vi.fn>
}> {
  const onCallback = vi.fn()
  const redirect = createIamLoopbackRedirect({ onCallback, ...options })
  active.push(redirect)
  const { redirectUri } = await redirect.start()
  return { redirect, redirectUri, onCallback }
}

describe('createIamLoopbackRedirect', () => {
  it('binds loopback, delivers callbacks, and stops only on cancel', async () => {
    const { redirect, redirectUri, onCallback } = await started({ brandName: 'BirdCoder' })
    const url = new URL(redirectUri)
    expect(url.protocol).toBe('http:')
    expect(url.hostname).toBe('127.0.0.1')
    expect(url.pathname).toBe('/auth/callback')
    expect(Number(url.port)).toBeGreaterThan(0)

    const response = await navigate(`${redirectUri}?code=code-1&state=state-1`, {
      'accept-language': 'en-US,en;q=0.9',
    })
    expect(response.status).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['content-security-policy']).toContain("default-src 'none'")
    expect(await response.text()).toContain('BirdCoder: sign-in complete')
    expect(onCallback).toHaveBeenCalledWith(`${redirectUri}?code=code-1&state=state-1`)

    // A forged local callback must not close the listener for the real one.
    expect((await navigate(`${redirectUri}?code=forged&state=forged`)).status).toBe(200)
    expect(onCallback).toHaveBeenLastCalledWith(`${redirectUri}?code=forged&state=forged`)
    expect((await navigate(`${redirectUri}?code=code-2&state=state-2`)).status).toBe(200)
    expect(onCallback).toHaveBeenLastCalledWith(`${redirectUri}?code=code-2&state=state-2`)

    await redirect.cancel()
    await expect(navigate(`${redirectUri}?code=code-3&state=s`)).rejects.toThrow()
  })

  it('rejects a callback a web page could forge and marks its pages nosniff', async () => {
    const { redirectUri, onCallback } = await started()
    const port = new URL(redirectUri).port
    const host = `127.0.0.1:${port}`
    // RFC 8252 section 7.3: a local caller can reach the listener, so only the
    // browser navigation the authorization server starts may pass. A
    // cross-origin fetch always carries an Origin; Fetch Metadata marks it.
    expect(await rawGet(`${redirectUri}?code=c&state=s`, { host, origin: 'https://evil.test' })).toBe(404)
    expect(await rawGet(`${redirectUri}?code=c&state=s`, { host, 'sec-fetch-mode': 'no-cors' })).toBe(404)
    expect(await rawGet(`${redirectUri}?code=c&state=s`, { host, 'sec-fetch-dest': 'empty' })).toBe(404)
    expect(onCallback).not.toHaveBeenCalled()

    // The real callback is a top-level document navigation and still passes.
    expect(await rawGet(`${redirectUri}?code=c&state=s`, {
      host,
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
    })).toBe(200)
    expect(onCallback).toHaveBeenCalledTimes(1)
    const response = await navigate(`${redirectUri}?code=c2&state=s2`)
    expect(response.status).toBe(200)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(onCallback).toHaveBeenCalledTimes(2)
  })

  it('exposes the waiting redirect and one retained callback for a reloaded page', async () => {
    const { redirect, redirectUri } = await started()
    expect(redirect.pending()).toEqual({ redirectUri })
    expect(redirect.takeCallback()).toBeNull()

    const callback = `${redirectUri}?code=c&state=s`
    expect((await navigate(callback)).status).toBe(200)
    // The event had no listener on the page that reloaded; the shell keeps the
    // URL for the next page, and the take is destructive.
    expect(redirect.takeCallback()).toBe(callback)
    expect(redirect.takeCallback()).toBeNull()

    // A new attempt starts clean and stops exposing the old carrier.
    const next = (await redirect.start()).redirectUri
    expect(redirect.pending()).toEqual({ redirectUri: next })
    expect(redirect.takeCallback()).toBeNull()
    await redirect.cancel()
    expect(redirect.pending()).toBeNull()
  })

  it('never retains a callback no browser navigation could have produced', async () => {
    const { redirect, redirectUri } = await started()
    const port = new URL(redirectUri).port
    const host = `127.0.0.1:${port}`
    expect(await rawGet(`${redirectUri}?code=c&state=s`, { host, origin: 'https://evil.test' })).toBe(404)
    expect(redirect.takeCallback()).toBeNull()
    expect(await rawGet(`${redirectUri}?state=s`, { host })).toBe(404)
    expect(redirect.takeCallback()).toBeNull()
    await redirect.cancel()
  })

  it('drops the waiting carrier and its retained callback on cancel or timeout', async () => {
    const canceled = await started()
    await navigate(`${canceled.redirectUri}?code=c&state=s`)
    await canceled.redirect.cancel()
    expect(canceled.redirect.pending()).toBeNull()
    expect(canceled.redirect.takeCallback()).toBeNull()

    const timedOut = await started({ timeoutMs: 30 })
    await navigate(`${timedOut.redirectUri}?code=c&state=s`)
    await vi.waitFor(() => { expect(timedOut.redirect.pending()).toBeNull() })
    expect(timedOut.redirect.takeCallback()).toBeNull()
  })

  it('localizes the success page and escapes the brand name', async () => {
    const { redirect, redirectUri } = await started({ brandName: 'A<B' })
    const response = await navigate(`${redirectUri}?code=c&state=s`, {
      'accept-language': 'zh-CN,zh;q=0.9',
    })
    const page = await response.text()
    expect(page).toContain('登录完成')
    expect(page).toContain('A&#60;B')
    expect(page).not.toContain('<B')
    await redirect.cancel()
  })

  it('renders a failure page for an OAuth error callback', async () => {
    const { redirect, redirectUri } = await started()
    const response = await navigate(`${redirectUri}?error=access_denied&error_description=denied&state=s`)
    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('sign-in was not completed')
    expect(page).not.toContain('sign-in complete')
    await redirect.cancel()
  })

  it('rejects a foreign path, a foreign Host, a non-GET request, and a query without a code', async () => {
    const { redirectUri, onCallback } = await started()
    const port = new URL(redirectUri).port
    expect((await navigate(`http://127.0.0.1:${port}/other?code=c&state=s`)).status).toBe(404)
    expect((await navigate(`${redirectUri}?state=s`)).status).toBe(404)
    expect(await rawGet(`${redirectUri}?code=c&state=s`, { host: `evil.test:${port}` })).toBe(404)
    expect((await fetch(redirectUri, { method: 'POST', body: 'code=c&state=s' })).status).toBe(404)
    expect(onCallback).not.toHaveBeenCalled()
  })

  it('stops waiting on cancel and after its timeout', async () => {
    const canceled = await started()
    await canceled.redirect.cancel()
    await expect(navigate(`${canceled.redirectUri}?code=c&state=s`)).rejects.toThrow()
    expect(canceled.onCallback).not.toHaveBeenCalled()

    const timedOut = await started({ timeoutMs: 50 })
    await vi.waitFor(async () => {
      await expect(navigate(`${timedOut.redirectUri}?code=c&state=s`)).rejects.toThrow()
    })
  })

  it('replaces the previous listener when a second attempt starts', async () => {
    const onCallback = vi.fn()
    const redirect = createIamLoopbackRedirect({ onCallback })
    active.push(redirect)
    const firstUri = (await redirect.start()).redirectUri
    const secondUri = (await redirect.start()).redirectUri
    expect(secondUri).not.toBe(firstUri)
    await expect(navigate(`${firstUri}?code=c&state=s`)).rejects.toThrow()
    const response = await navigate(`${secondUri}?code=c2&state=s2`)
    expect(response.status).toBe(200)
    await vi.waitFor(() => { expect(onCallback).toHaveBeenCalledWith(`${secondUri}?code=c2&state=s2`) })
  })
})
