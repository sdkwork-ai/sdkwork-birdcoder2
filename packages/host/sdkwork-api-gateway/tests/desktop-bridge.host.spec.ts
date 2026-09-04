/**
 * Host-side desktop bridge behavior: the /api gateway fallback's privileged
 * pinning and apiProxy dispatch, plus the DesktopBridgeService's fetch and
 * event-stream surface over a fake api.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api'
import { createApiGatewayFetch } from '../src/api-gateway.ts'
import { apply, DesktopBridgeService, inject } from '../src/desktop.ts'

/** A minimal ApiProxy-shaped stub with the two domains the tests exercise. */
function fakeApi(): ApiProxy {
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
  } as unknown as ApiProxy
}

/** A request shaped like the desktop app's IPC normalization (loopback authority). */
function loopbackRequest(path: string, body: string): Request {
  return new Request(`http://127.0.0.1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: '127.0.0.1' },
    body,
  })
}

function envelope(rpcId: string, method: string): string {
  return JSON.stringify({ type: 'client-request', rpcId, method, payload: {} })
}

describe('createApiGatewayFetch', () => {
  it('answers 404 when no apiProxy is mounted', async () => {
    const gateway = createApiGatewayFetch(new Context())
    const response = await gateway.fetch(loopbackRequest('/api/session.list', envelope('r1', 'session.list')))
    expect(response.status).toBe(404)
  })

  it('pins privileged methods to loopback trust before dispatch', async () => {
    const ctx = new Context()
    ctx.provide('apiProxy', fakeApi())
    const gateway = createApiGatewayFetch(ctx)
    // A non-loopback Host on a pinned method is refused even with a gateway.
    const refused = await gateway.fetch(new Request('http://evil.example/api/settings.describe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'evil.example' },
      body: envelope('r1', 'settings.describe'),
    }))
    expect(refused.status).toBe(403)
    // A loopback Host reaches the gateway.
    const allowed = await gateway.fetch(loopbackRequest('/api/settings.describe', envelope('r2', 'settings.describe')))
    expect(allowed.status).toBe(200)
    const body = await allowed.json() as { rpcId: string }
    expect(body.rpcId).toBe('r2')
  })

  it('dispatches non-privileged methods to the gateway', async () => {
    const ctx = new Context()
    ctx.provide('apiProxy', fakeApi())
    const gateway = createApiGatewayFetch(ctx)
    const response = await gateway.fetch(loopbackRequest('/api/session.list', envelope('r3', 'session.list')))
    expect(response.status).toBe(200)
    const body = await response.json() as { rpcId: string; result: { ok: boolean } }
    expect(body.rpcId).toBe('r3')
    expect(body.result.ok).toBe(true)
  })
})

describe('DesktopBridgeService', () => {
  it('mounts through the plugin body over the connection host service', async () => {
    const ctx = new Context()
    ctx.provide('apiProxy', fakeApi())
    // Merged shared-handler contract: one channel argument, and the handler
    // 404s what it does not own — the bridge's gateway fallback answers.
    const connection = {
      createSharedFetchHandler: (_channel: string) => ({
        fetch: async () => new Response('not found', { status: 404 }),
      }),
    }
    ctx.provide('connection', connection as never)
    const fiber = ctx.plugin({ inject, apply })
    await fiber
    try {
      const bridge = ctx.get('desktopBridge') as DesktopBridgeService
      expect(bridge).toBeDefined()
      const response = await bridge.fetch(loopbackRequest('/api/session.list', envelope('r5', 'session.list')))
      expect(response.status).toBe(200)
    } finally {
      await fiber.dispose()
    }
  })

  it('delegates fetch to the shared handler', async () => {
    const ctx = new Context()
    ctx.provide('apiProxy', fakeApi())
    const service = new DesktopBridgeService(ctx, createApiGatewayFetch(ctx))
    const response = await service.fetch(loopbackRequest('/api/session.list', envelope('r4', 'session.list')))
    expect(response.status).toBe(200)
  })

  it('fails loud opening a stream without the apiProxy service', () => {
    const service = new DesktopBridgeService(new Context(), {
      fetch: async () => new Response(null, { status: 404 }),
    })
    expect(() => service.openMux(new AbortController().signal)).toThrow('apiProxy service missing')
  })

  it('opens a Typert Remote stream through the Gateway wire stream', async () => {
    const wireFrames: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'baseline', sessions: [] }
        yield { type: 'running', sessionId: 's1', running: true }
      },
    }
    const open = vi.fn(async () => wireFrames)
    const ctx = new Context()
    ctx.provide('typertGateway', { wireStream: { open } })
    const service = new DesktopBridgeService(ctx, {
      fetch: async () => new Response(null, { status: 404 }),
    })
    const stream = service.openStream('session/control', { args: {} }, new AbortController().signal)
    const iterator = stream[Symbol.asyncIterator]()
    // Async-generator bodies run lazily: the wire opener fires on first next().
    const first = iterator.next()
    expect(open).toHaveBeenCalledWith('session/control', { args: {} }, expect.any(AbortSignal))
    expect((await first).value).toMatchObject({ type: 'baseline', sessions: [] })
    const second = await iterator.next()
    expect(second.value).toMatchObject({ type: 'running', sessionId: 's1', running: true })
  })

  it('fails loud opening a Remote stream without the typertGateway service', async () => {
    const service = new DesktopBridgeService(new Context(), {
      fetch: async () => new Response(null, { status: 404 }),
    })
    const stream = service.openStream('session/control', { args: {} }, new AbortController().signal)
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('typertGateway service missing')
  })

  it('yields mux and host frames from the api event generators', async () => {
    const muxFrames: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: async function* () {
        yield { rpcId: RpcId('m1'), payload: { type: 'session/subscribed', sessionId: 's1', lastSeq: 1 } }
      },
    }
    const hostFrames: AsyncIterable<unknown> = {
      [Symbol.asyncIterator]: async function* () {
        yield { rpcId: RpcId('h1'), payload: { type: 'host/session-status', sessionId: 's1', running: true } }
      },
    }
    const api = {
      events: {
        mux: () => muxFrames,
        host: () => hostFrames,
      },
    } as unknown as ApiProxy
    const ctx = new Context()
    ctx.provide('apiProxy', api)
    const service = new DesktopBridgeService(ctx, {
      fetch: async () => new Response(null, { status: 404 }),
    })
    const mux = service.openMux(new AbortController().signal)
    const host = service.openHost(new AbortController().signal)
    const muxFrame = await mux[Symbol.asyncIterator]().next()
    expect((muxFrame.value as { payload: { type: string } }).payload).toMatchObject({ type: 'session/subscribed' })
    const hostFrame = await host[Symbol.asyncIterator]().next()
    expect((hostFrame.value as { payload: { type: string } }).payload).toMatchObject({ type: 'host/session-status' })
  })
})
