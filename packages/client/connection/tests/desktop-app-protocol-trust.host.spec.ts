/**
 * Desktop app:// protocol trust regression: renderer fetch that bypasses IPC
 * must pass the same /api trust fence as loopback-normalized IPC traffic.
 *
 * Surfaces audited:
 * - Unary RPC, respond, generic Connection channels, event streams: IPC /
 *   WebSocket carriers (not raw app:// fetch).
 * - session.export HEAD/GET: raw renderer fetch over app:// (Session log export).
 * - Static assets and plugin bundles: app:// routes outside /api (no fence).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import DesktopWebServer, { Config as DesktopConfig } from '@deepseek-ai/dsh-sdkwork-desktop-carrier'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { apply as applyConnection, inject as connectionInject } from '../src/index.ts'
import { apply as applyDesktopConnection, inject as desktopConnectionInject } from '../src/desktop.ts'

const APP_ORIGIN = 'app://dsh'
const SESSION_ID = 'session-desktop-trust'

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
        headers: {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="dsh-session-${SESSION_ID}.zip"`,
        },
      }),
    },
  } as unknown as ApiProxy
}

async function mountedDesktopApi(): Promise<{
  carrier: DesktopWebServer
  ctx: Context
  dispose: () => Promise<void>
}> {
  const ctx = new Context()
  const carrier = new DesktopWebServer(ctx, new DesktopConfig({ host: '127.0.0.1', port: 0 }))
  ctx.provide('apiProxy', stubApiProxy())
  // Mount in two fibers: desktop-connection injects `connection`, which
  // applyConnection creates — a single combined inject would fail before apply.
  const connectionFiber = ctx.plugin({ inject: connectionInject, apply: applyConnection })
  await connectionFiber.await()
  const desktopFiber = ctx.plugin({ inject: desktopConnectionInject, apply: applyDesktopConnection })
  await desktopFiber.await()
  return {
    carrier,
    ctx,
    dispose: async () => {
      await desktopFiber.dispose()
      await connectionFiber.dispose()
    },
  }
}

function appRequest(path: string, init?: RequestInit): Request {
  return new Request(`${APP_ORIGIN}${path}`, {
    ...init,
    headers: {
      host: 'dsh',
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

describe('desktop app:// /api trust (renderer fetch bypassing IPC)', () => {
  it('allows session.export HEAD preflight from app://dsh', async () => {
    const { carrier, dispose } = await mountedDesktopApi()
    try {
      const response = await carrier.dispatch(appRequest(
        `/api/session.export?sessionId=${SESSION_ID}&includeDescendants=true`,
        { method: 'HEAD' },
      ))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/zip')
      expect(response.body).toBeNull()
    } finally {
      await dispose()
    }
  })

  it('allows session.export GET download from app://dsh', async () => {
    const { carrier, dispose } = await mountedDesktopApi()
    try {
      const response = await carrier.dispatch(appRequest(
        `/api/session.export?sessionId=${SESSION_ID}&includeDescendants=true`,
        { method: 'GET' },
      ))
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('zip-bytes')
    } finally {
      await dispose()
    }
  })

  it('allows unary POST that would use IPC when sent as raw app:// fetch', async () => {
    const { carrier, dispose } = await mountedDesktopApi()
    try {
      const body = JSON.stringify({
        type: 'client-request',
        rpcId: RpcId('desktop-trust-list'),
        method: 'session.list',
        payload: {},
      })
      const response = await carrier.dispatch(appRequest('/api/session.list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }))
      expect(response.status).toBe(200)
      const parsed = await response.json() as { rpcId: string; result: { ok: boolean } }
      expect(parsed.rpcId).toBe('desktop-trust-list')
      expect(parsed.result.ok).toBe(true)
    } finally {
      await dispose()
    }
  })

  it('allows privileged unary POST from app://dsh after loopback Host normalization', async () => {
    const { carrier, dispose } = await mountedDesktopApi()
    try {
      const body = JSON.stringify({
        type: 'client-request',
        rpcId: RpcId('desktop-trust-settings'),
        method: 'settings.describe',
        payload: {},
      })
      const response = await carrier.dispatch(appRequest('/api/settings.describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }))
      expect(response.status).toBe(200)
      const parsed = await response.json() as { rpcId: string; result: { ok: boolean } }
      expect(parsed.rpcId).toBe('desktop-trust-settings')
      expect(parsed.result.ok).toBe(true)
    } finally {
      await dispose()
    }
  })

  it('still refuses explicit cross-site fetch metadata after Host normalization', async () => {
    const { carrier, dispose } = await mountedDesktopApi()
    try {
      const response = await carrier.dispatch(appRequest('/api/session.list', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: RpcId('desktop-trust-cross-site'),
          method: 'session.list',
          payload: {},
        }),
      }))
      expect(response.status).toBe(403)
      expect(await response.text()).toBe('forbidden')
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
      // is the IPC-side normalization. Raw renderer fetch uses carrier.dispatch instead.
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
      const body = JSON.stringify({
        type: 'client-request',
        rpcId: RpcId('desktop-trust-bridge-settings'),
        method: 'settings.describe',
        payload: {},
      })
      const response = await bridge.fetch(ipcNormalizedRequest('/api/settings.describe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
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
      const body = JSON.stringify({
        type: 'client-request',
        rpcId: RpcId('desktop-trust-bridge-origin'),
        method: 'settings.describe',
        payload: {},
      })
      const response = await bridge.fetch(new Request('http://127.0.0.1/api/settings.describe', {
        method: 'POST',
        headers: {
          host: '127.0.0.1',
          origin: APP_ORIGIN,
          'content-type': 'application/json',
        },
        body,
      }))
      expect(response.status).toBe(403)
      expect(await response.text()).toBe('forbidden')
    } finally {
      await dispose()
    }
  })

  it('accepts same-origin fetch metadata on raw app:// traffic after Host rewrite', async () => {
    const { carrier, dispose } = await mountedDesktopApi()
    try {
      const response = await carrier.dispatch(appRequest('/api/session.list', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'sec-fetch-site': 'same-origin',
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: RpcId('desktop-trust-same-origin'),
          method: 'session.list',
          payload: {},
        }),
      }))
      expect(response.status).toBe(200)
    } finally {
      await dispose()
    }
  })
})
