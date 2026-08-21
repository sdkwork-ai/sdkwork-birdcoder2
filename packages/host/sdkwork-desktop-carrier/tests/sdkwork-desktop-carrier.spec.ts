/**
 * Desktop carrier behavior: the webServer-shaped route/fallback/index-tap
 * registry driven by dispatch — the desktop analogue of the web carrier's
 * HTTP server, with the node:http-shaped handler surface shimmed per request.
 */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import DesktopWebServer, { Config } from '../src/index.ts'

function carrier(host: '127.0.0.1' | '0.0.0.0' = '127.0.0.1'): DesktopWebServer {
  return new DesktopWebServer(new Context(), new Config({ host, port: 0 }))
}

/** The carrier's context logger, for error-path spies. */
function loggerOf(server: DesktopWebServer): { warn: (message: unknown) => void } {
  return (server as unknown as { ctx: { logger: { warn: (message: unknown) => void } } }).ctx.logger
}

function request(url: string): Request {
  return new Request(url)
}

/** A route whose handler writes through the shimmed node:http surface. */
function route(path: string, kind: WebRoute['kind'] = 'exact'): WebRoute {
  return {
    kind,
    path,
    handler: async (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`ok:${req.method}:${req.url}`)
    },
  }
}

describe('DesktopWebServer routes', () => {
  it('serves exact and prefix routes with longest-prefix precedence', async () => {
    const server = carrier()
    server.register(route('/plugins', 'prefix'))
    server.register(route('/plugins/deep', 'prefix'))
    const shallow = await server.dispatch(request('http://app.invalid/plugins'))
    expect(shallow.status).toBe(200)
    expect(await shallow.text()).toBe('ok:GET:/plugins')
    const deep = await server.dispatch(request('http://app.invalid/plugins/deep/x'))
    expect(deep.status).toBe(200)
    expect(await deep.text()).toBe('ok:GET:/plugins/deep/x')
    const unmatched = await server.dispatch(request('http://app.invalid/elsewhere'))
    expect(unmatched.status).toBe(404)
  })

  it('answers 404 when no route or fallback exists', async () => {
    const response = await carrier().dispatch(request('http://app.invalid/anything'))
    expect(response.status).toBe(404)
  })

  it('answers 400 on an unparsable request URL', async () => {
    const response = await carrier().dispatch({ url: '://bad' } as Request)
    expect(response.status).toBe(400)
  })

  it('rejects duplicate (kind, path) and upgrade registrations', () => {
    const server = carrier()
    server.register(route('/a'))
    expect(() => server.register(route('/a'))).toThrow('duplicate exact route')
    server.register(route('/b', 'prefix'))
    expect(() => server.register(route('/b', 'prefix'))).toThrow('duplicate prefix route')
    server.registerUpgrade({ path: '/up', handler: () => {} })
    expect(() => server.registerUpgrade({ path: '/up', handler: () => {} })).toThrow('duplicate upgrade route')
  })

  it('removes routes, upgrades, and the fallback on dispose', async () => {
    const server = carrier()
    const removeRoute = server.register(route('/gone'))
    const removeUpgrade = server.registerUpgrade({ path: '/up', handler: () => {} })
    const releaseFallback = server.registerFallback(route('/').handler)
    removeRoute()
    removeUpgrade()
    releaseFallback()
    expect((await server.dispatch(request('http://app.invalid/gone'))).status).toBe(404)
    expect((await server.dispatch(request('http://app.invalid/anything'))).status).toBe(404)
  })
})

describe('DesktopWebServer fallback and index taps', () => {
  it('serves the fallback seat for unmatched paths', async () => {
    const server = carrier()
    server.registerFallback(route('/').handler)
    const response = await server.dispatch(request('http://app.invalid/assets/x.js'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok:GET:/assets/x.js')
  })

  it('allows only one fallback owner', () => {
    const server = carrier()
    server.registerFallback(route('/').handler)
    expect(() => server.registerFallback(route('/').handler)).toThrow('fallback already registered')
  })

  it('applies index taps in registration order', () => {
    const server = carrier()
    const a = server.tapIndex(html => `${html}a`)
    const b = server.tapIndex(html => `${html}b`)
    expect(server.applyIndexTaps('x')).toBe('xab')
    a()
    expect(server.applyIndexTaps('x')).toBe('xb')
    b()
    expect(server.applyIndexTaps('x')).toBe('x')
  })
})

describe('DesktopWebServer dispatch error handling', () => {
  it('answers 400 when the handler throws before writing headers', async () => {
    const server = carrier()
    const warn = vi.spyOn(loggerOf(server), 'warn').mockImplementation(() => {})
    server.register({
      kind: 'exact',
      path: '/boom',
      handler: async () => { throw new Error('boom') },
    })
    const response = await server.dispatch(request('http://app.invalid/boom'))
    expect(response.status).toBe(400)
    expect(warn).toHaveBeenCalled()
  })

  it('answers 500 when the handler throws after writing headers', async () => {
    const server = carrier()
    vi.spyOn(loggerOf(server), 'warn').mockImplementation(() => {})
    server.register({
      kind: 'exact',
      path: '/half',
      handler: async (_req, res) => {
        res.writeHead(200)
        throw new Error('late')
      },
    })
    const response = await server.dispatch(request('http://app.invalid/half'))
    expect(response.status).toBe(500)
  })
})

describe('DesktopWebServer config surface', () => {
  it('exposes the configured host and port (informational)', () => {
    const server = carrier('0.0.0.0')
    expect(server.host).toBe('0.0.0.0')
    expect(server.port).toBe(0)
  })

  it('carries binary bodies (Buffer) through to the Response', async () => {
    const server = carrier()
    server.register({
      kind: 'exact',
      path: '/bin',
      handler: async (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end(Buffer.from([1, 2, 3]))
      },
    })
    const response = await server.dispatch(request('http://app.invalid/bin'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]))
  })
})
