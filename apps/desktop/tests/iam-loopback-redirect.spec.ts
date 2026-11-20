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

    const response = await fetch(`${redirectUri}?code=code-1&state=state-1`, {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(await response.text()).toContain('BirdCoder: sign-in complete')
    expect(onCallback).toHaveBeenCalledWith(`${redirectUri}?code=code-1&state=state-1`)

    // A forged local callback must not close the listener for the real one.
    expect((await fetch(`${redirectUri}?code=forged&state=forged`)).status).toBe(200)
    expect(onCallback).toHaveBeenLastCalledWith(`${redirectUri}?code=forged&state=forged`)
    expect((await fetch(`${redirectUri}?code=code-2&state=state-2`)).status).toBe(200)
    expect(onCallback).toHaveBeenLastCalledWith(`${redirectUri}?code=code-2&state=state-2`)

    await redirect.cancel()
    await expect(fetch(`${redirectUri}?code=code-3&state=s`)).rejects.toThrow()
  })

  it('localizes the success page and escapes the brand name', async () => {
    const { redirect, redirectUri } = await started({ brandName: 'A<B' })
    const response = await fetch(`${redirectUri}?code=c&state=s`, {
      headers: { 'accept-language': 'zh-CN,zh;q=0.9' },
    })
    const page = await response.text()
    expect(page).toContain('登录完成')
    expect(page).toContain('A&#60;B')
    expect(page).not.toContain('<B')
    await redirect.cancel()
  })

  it('renders a failure page for an OAuth error callback', async () => {
    const { redirect, redirectUri } = await started()
    const response = await fetch(`${redirectUri}?error=access_denied&error_description=denied&state=s`)
    expect(response.status).toBe(200)
    const page = await response.text()
    expect(page).toContain('sign-in was not completed')
    expect(page).not.toContain('sign-in complete')
    await redirect.cancel()
  })

  it('rejects a foreign path, a foreign Host, a non-GET request, and a query without a code', async () => {
    const { redirectUri, onCallback } = await started()
    const port = new URL(redirectUri).port
    expect((await fetch(`http://127.0.0.1:${port}/other?code=c&state=s`)).status).toBe(404)
    expect((await fetch(`${redirectUri}?state=s`)).status).toBe(404)
    expect(await rawGet(`${redirectUri}?code=c&state=s`, { host: `evil.test:${port}` })).toBe(404)
    expect((await fetch(redirectUri, { method: 'POST', body: 'code=c&state=s' })).status).toBe(404)
    expect(onCallback).not.toHaveBeenCalled()
  })

  it('stops waiting on cancel and after its timeout', async () => {
    const canceled = await started()
    await canceled.redirect.cancel()
    await expect(fetch(`${canceled.redirectUri}?code=c&state=s`)).rejects.toThrow()
    expect(canceled.onCallback).not.toHaveBeenCalled()

    const timedOut = await started({ timeoutMs: 50 })
    await vi.waitFor(async () => {
      await expect(fetch(`${timedOut.redirectUri}?code=c&state=s`)).rejects.toThrow()
    })
  })

  it('replaces the previous listener when a second attempt starts', async () => {
    const onCallback = vi.fn()
    const redirect = createIamLoopbackRedirect({ onCallback })
    active.push(redirect)
    const firstUri = (await redirect.start()).redirectUri
    const secondUri = (await redirect.start()).redirectUri
    expect(secondUri).not.toBe(firstUri)
    await expect(fetch(`${firstUri}?code=c&state=s`)).rejects.toThrow()
    const response = await fetch(`${secondUri}?code=c2&state=s2`)
    expect(response.status).toBe(200)
    await vi.waitFor(() => { expect(onCallback).toHaveBeenCalledWith(`${secondUri}?code=c2&state=s2`) })
  })
})
