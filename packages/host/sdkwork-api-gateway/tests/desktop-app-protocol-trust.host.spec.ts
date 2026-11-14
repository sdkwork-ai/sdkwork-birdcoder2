/**
 * Desktop /api trust regression: renderer traffic that bypasses the IPC
 * carriers must pass the same /api trust fence as loopback-normalized IPC.
 *
 * The two renderer surfaces and their fences:
 * - `desktopBridge.fetch` — the Electron main process wires IPC to it; the
 *   loopback rewrite in the app's ipc.ts is the IPC-side normalization, and
 *   the bridge dispatches as the owner Peer without the HTTP fence.
 * - Raw renderer fetch — the shell forwards `dsh-app://app` requests to the
 *   Host's loopback HTTP listener through `forwardWebRequest` (the shell
 *   rejects every other origin and strips `origin`/`host`/`sec-fetch-site`),
 *   and the Host answers through the webserver fence plus the desktop Host's
 *   private `dsh-desktop-session` credential.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { apply as applyConnection, inject as connectionInject } from '@deepseek-ai/dsh-client-connection'
import { apply as applyDesktopAuthentication, inject as desktopAuthenticationInject } from '@deepseek-ai/dsh-host-authentication-desktop'
import { apply as applyGateway, name as gatewayName } from '../src/index.ts'
import { apply as applyDesktopConnection, inject as desktopConnectionInject } from '../src/desktop.ts'
import { forwardWebRequest } from '../../../../apps/desktop/src/web-document.ts'

/** The shell origin `forwardWebRequest` admits; every other origin is refused. */
const APP_ORIGIN = 'dsh-app://app'
const SESSION_ID = 'session-desktop-trust'

/** The desktop Host's private session credential: the parent process validates
 * it over its own IPC channel and the Host accepts it as an ordinary cookie
 * (`packages/host/authentication-desktop`), so the spec presents the same
 * `dsh-desktop-session` credential the shipped main process presents. */
const DESKTOP_SECRET = 'A'.repeat(43)

/** The cookie header the shipped desktop renderer fetches carry. */
function desktopCookie(): string {
  return `dsh-desktop-session=${DESKTOP_SECRET}`
}

/** Minimal apiProxy stub covering session.export and one privileged unary route. */
function stubApiProxy(): ApiProxy {
  return {
    sessions: {
      list: async (request: { rpcId: string }) => ({
        rpcId: request.rpcId,
        result: { ok: true, value: { items: [] } },
      }),
    },
    settings: {
      describe: async (request: { rpcId: string }) => ({
        rpcId: request.rpcId,
        result: { ok: true, value: {} },
      }),
    },
    downloads: {
      sessionLog: async () => new Response('zip-bytes', {
        status: 200,
        headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="dsh-session-${SESSION_ID}.zip"` },
      }),
    },
  } as unknown as ApiProxy
}

async function mountedDesktopApi(): Promise<{
  origin: string
  ctx: Context
  cookie: string
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  // The raw-fetch surface is the Host's loopback HTTP listener: the shell's
  // forwardWebRequest proxies `dsh-app://app` traffic to it, so the spec mounts
  // the ordinary webserver composition the desktop Host runs. The carrier is
  // the in-process dispatch service the bridge tests read separately.
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }).await()
  ctx.provide('apiProxy', stubApiProxy())
  // Mount in two fibers: desktop-connection injects `connection`, which
  // applyConnection creates — a single combined inject would fail before apply.
  const connectionFiber = ctx.plugin({ inject: connectionInject, apply: applyConnection })
  await connectionFiber.await()
  // The /api fallback and event uplinks ride the sdkwork gateway slot row.
  const gatewayFiber = ctx.plugin({ name: gatewayName, apply: applyGateway })
  await gatewayFiber.await()
  const desktopFiber = ctx.plugin({ inject: desktopConnectionInject, apply: applyDesktopConnection })
  await desktopFiber.await()
  // The desktop Host's private credential verifier accepts the shared-secret
  // cookie (the shipped main process delivers it over the parent IPC channel).
  const authenticationFiber = ctx.plugin({
    inject: desktopAuthenticationInject,
    apply: (scope: Context) => applyDesktopAuthentication(scope, { readSecret: () => DESKTOP_SECRET }),
  })
  await authenticationFiber.await()
  return {
    origin: ctx.webServer.getOrigin(),
    ctx,
    cookie: desktopCookie(),
    dispose: async () => {
      await authenticationFiber.dispose()
      await gatewayFiber.dispose()
      await desktopFiber.dispose()
      await connectionFiber.dispose()
    },
  }
}

/** One renderer fetch exactly as the app:// protocol handler receives it. */
function rendererRequest(path: string, init?: RequestInit): Request {
  return new Request(`${APP_ORIGIN}${path}`, {
    ...init,
    headers: {
      origin: APP_ORIGIN,
      ...(init?.headers ?? {}),
    },
  })
}

/** Mirror apps/desktop ipc.ts loopback normalization for bridge-path assertions. */
function ipcNormalizedRequest(path: string, init?: RequestInit): Request {
  const parsed = new URL(`${APP_ORIGIN}${path}`)
  const headers = new Headers(init?.headers)
  headers.set('host', '127.0.0.1')
  headers.delete('origin')
  return new Request(`http://127.0.0.1${parsed.pathname}${parsed.search}`, {
    ...init,
    headers,
  })
}

function unaryBody(rpcId: string, method: string): string {
  return JSON.stringify({ type: 'client-request', rpcId: RpcId(rpcId), method, payload: {} })
}

describe('desktop /api trust (renderer traffic bypassing IPC)', () => {
  it('allows session.export HEAD preflight through the forwarded raw fetch', async () => {
    const { origin, cookie, dispose } = await mountedDesktopApi()
    try {
      const response = await forwardWebRequest(rendererRequest(
        `/api/session.export?sessionId=${SESSION_ID}&includeDescendants=true`,
        { method: 'HEAD' },
      ), origin, cookie)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/zip')
      expect(response.body).toBeNull()
    } finally {
      await dispose()
    }
  })

  it('allows session.export GET download through the forwarded raw fetch', async () => {
    const { origin, cookie, dispose } = await mountedDesktopApi()
    try {
      const response = await forwardWebRequest(rendererRequest(
        `/api/session.export?sessionId=${SESSION_ID}&includeDescendants=true`,
        { method: 'GET' },
      ), origin, cookie)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('zip-bytes')
    } finally {
      await dispose()
    }
  })

  it('allows unary POST that would use IPC when sent as raw renderer fetch', async () => {
    const { origin, cookie, dispose } = await mountedDesktopApi()
    try {
      const response = await forwardWebRequest(rendererRequest('/api/session.list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: unaryBody('desktop-trust-list', 'session.list'),
      }), origin, cookie)
      expect(response.status).toBe(200)
      const parsed = await response.json() as { rpcId: string; result: { ok: boolean } }
      expect(parsed.rpcId).toBe('desktop-trust-list')
      expect(parsed.result.ok).toBe(true)
    } finally {
      await dispose()
    }
  })

  it('allows privileged unary POST from the shell origin after normalization', async () => {
    const { origin, cookie, dispose } = await mountedDesktopApi()
    try {
      const response = await forwardWebRequest(rendererRequest('/api/settings.describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: unaryBody('desktop-trust-settings', 'settings.describe'),
      }), origin, cookie)
      expect(response.status).toBe(200)
      const parsed = await response.json() as { rpcId: string; result: { ok: boolean } }
      expect(parsed.rpcId).toBe('desktop-trust-settings')
      expect(parsed.result.ok).toBe(true)
    } finally {
      await dispose()
    }
  })

  it('refuses renderer fetches from any origin other than the shell origin', async () => {
    const { origin, cookie, dispose } = await mountedDesktopApi()
    try {
      const request = new Request(`${APP_ORIGIN}/api/session.list`, {
        method: 'POST',
        headers: { origin: 'https://cross-site.example', 'content-type': 'application/json' },
        body: unaryBody('desktop-trust-cross-site', 'session.list'),
      })
      const response = await forwardWebRequest(request, origin, cookie)
      expect(response.status).toBe(403)
    } finally {
      await dispose()
    }
  })

  it('accepts same-origin renderer fetch metadata after the shell strips it', async () => {
    const { origin, cookie, dispose } = await mountedDesktopApi()
    try {
      // The shell strips `sec-fetch-site` before forwarding, so the Host fence
      // sees plain loopback traffic; same-origin metadata must not survive and
      // turn into a refusal.
      const response = await forwardWebRequest(rendererRequest('/api/session.list', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        body: unaryBody('desktop-trust-same-origin', 'session.list'),
      }), origin, cookie)
      expect(response.status).toBe(200)
      const parsed = await response.json() as { rpcId: string; result: { ok: boolean } }
      expect(parsed.result.ok).toBe(true)
    } finally {
      await dispose()
    }
  })

  it('routes desktopBridge fetch for session.export without the HTTP-route Host fence', async () => {
    const { ctx, dispose } = await mountedDesktopApi()
    const bridge = ctx.get('desktopBridge') as {
      fetch(request: Request): Promise<Response>
    }
    try {
      // IPC bypasses the webServer route trust fence; loopback rewrite in ipc.ts
      // is the IPC-side normalization.
      const response = await bridge.fetch(new Request(`http://127.0.0.1/api/session.export?sessionId=${SESSION_ID}`, {
        method: 'HEAD',
        headers: { host: '127.0.0.1' },
      }))
      expect(response.status).toBe(200)
    } finally {
      await dispose()
    }
  })

  it('allows privileged unary POST through desktopBridge after IPC-style normalization', async () => {
    const { ctx, dispose } = await mountedDesktopApi()
    const bridge = ctx.get('desktopBridge') as {
      fetch(request: Request): Promise<Response>
    }
    try {
      const response = await bridge.fetch(ipcNormalizedRequest('/api/settings.describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: unaryBody('desktop-trust-bridge-settings', 'settings.describe'),
      }))
      expect(response.status).toBe(200)
      const parsed = await response.json() as { rpcId: string; result: { ok: boolean } }
      expect(parsed.rpcId).toBe('desktop-trust-bridge-settings')
      expect(parsed.result.ok).toBe(true)
    } finally {
      await dispose()
    }
  })

  it('still pins privileged unary POST on desktopBridge when Origin survives normalization', async () => {
    const { ctx, dispose } = await mountedDesktopApi()
    const bridge = ctx.get('desktopBridge') as {
      fetch(request: Request): Promise<Response>
    }
    try {
      const response = await bridge.fetch(new Request('http://127.0.0.1/api/settings.describe', {
        method: 'POST',
        headers: {
          host: '127.0.0.1',
          origin: APP_ORIGIN,
          'content-type': 'application/json',
        },
        body: unaryBody('desktop-trust-bridge-origin', 'settings.describe'),
      }))
      expect(response.status).toBe(403)
      expect(await response.text()).toBe('forbidden')
    } finally {
      await dispose()
    }
  })
})
