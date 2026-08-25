/**
 * @deepseek-ai/dsh-sdkwork-desktop-carrier — the Electron desktop carrier: a
 * `webServer`-service-shaped route registry that is driven by the desktop
 * shell's `app://` protocol handler instead of node:http. It knows no harness
 * concepts and serves no files; the composing application's frontend plugin
 * owns dist serving through the fallback hook, exactly like the web carrier.
 * The web composition (client-modules bundle route + boot-manifest index tap,
 * frontend-static fallback, ui-theme index tap) mounts unchanged over it —
 * the sdkwork-desktop-app bundle swaps the `webserver` row for this package, and the
 * app's protocol handler calls {@link DesktopWebServer.dispatch} per request.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebRoute, WebUpgradeRoute } from '@deepseek-ai/dsh-host-webserver'
import { renderIndexInjections, type IndexInjection } from '@deepseek-ai/dsh-host-webserver'

/** Gateway config, mirroring the web carrier: the listen address the web composition reads. */
export interface Config {
  /** Loopback or all-interfaces literal; the desktop shell never binds, the value is informational. */
  host: '127.0.0.1' | '0.0.0.0'
  /** Informational port (the desktop shell opens no socket). */
  port: number
}

/** Config schema, mirroring the web carrier's (both the module export and the class static). */
export const Config: z<Config> = z.object({
  host: z.union([z.const('127.0.0.1'), z.const('0.0.0.0')]).required(),
  port: z.natural().max(65535).required(),
})

/** A node:http-shaped response the route handlers write. */
interface DesktopResponse extends EventEmitter {
  writeHead(status: number, headers?: Record<string, string>): void
  setHeader(name: string, value: string): void
  write(chunk: string | Uint8Array): boolean
  end(body?: unknown): void
  writableEnded: boolean
  headersSent: boolean
  on(event: 'close' | 'drain', listener: () => void): this
  once(event: 'close' | 'drain', listener: () => void): this
  off(event: 'close' | 'drain', listener: () => void): this
}

/**
 * The desktop browser carrier service: the same route/fallback/index-tap
 * registries as the web carrier, delivered through {@link dispatch} instead of
 * a listening socket. It never opens a port — Electron loads the built
 * frontend over `app://` and carries RPC over IPC, so this service exists to
 * keep the composition's `webServer` consumers working verbatim.
 */
export class DesktopWebServer extends Service {
  static Config: z<Config> = Config

  private readonly exact = new Map<string, WebRoute>()
  private readonly prefixes = new Map<string, WebRoute>()
  private readonly upgrades = new Map<string, WebUpgradeRoute>()
  private readonly indexTaps: ((html: string) => string)[] = []
  private fallback: WebRoute['handler'] | undefined

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'webServer')
  }

  /** The configured bind literal (informational; the shell opens no socket). */
  get host(): Config['host'] {
    return this.config.host
  }

  /** The configured port (informational; the shell opens no socket). */
  get port(): number {
    return this.config.port
  }

  /**
   * Register a named route. Duplicate (kind, path) throws — route patterns are
   * a composition-level contract, so a collision is a misconfiguration.
   * @param route - kind, path, and the owning handler.
   * @returns the disposer removing the route.
   */
  register(route: WebRoute): () => void {
    const table = route.kind === 'exact' ? this.exact : this.prefixes
    if (table.has(route.path)) {
      throw new Error(`sdkwork-desktop-carrier: duplicate ${route.kind} route "${route.path}"`)
    }
    table.set(route.path, route)
    return () => { table.delete(route.path) }
  }

  /**
   * Register an exact-path upgrade route. The desktop surface never upgrades a
   * socket — event streams ride IPC directly — so registrations are held for
   * structural parity with the web carrier and never dispatched.
   * @param route - pathname and handler.
   * @returns the disposer removing the route.
   */
  registerUpgrade(route: WebUpgradeRoute): () => void {
    if (this.upgrades.has(route.path)) {
      throw new Error(`sdkwork-desktop-carrier: duplicate upgrade route "${route.path}"`)
    }
    this.upgrades.set(route.path, route)
    return () => { this.upgrades.delete(route.path) }
  }

  /**
   * Claim the fallback seat: the handler answering every request no named
   * route matches (the SPA dist server in the shipped composition). One owner
   * only.
   * @param handler - owns the full response lifecycle of unmatched requests.
   * @returns the disposer releasing the seat.
   */
  registerFallback(handler: WebRoute['handler']): () => void {
    if (this.fallback !== undefined) {
      throw new Error('sdkwork-desktop-carrier: fallback already registered')
    }
    this.fallback = handler
    return () => { this.fallback = undefined }
  }

  /**
   * Register an index.html transform, applied to every index response in
   * registration order.
   * @param transform - pure html-to-html function.
   * @returns the disposer removing the transform.
   */
  tapIndex(transform: (html: string) => string): () => void {
    this.indexTaps.push(transform)
    return () => {
      const at = this.indexTaps.indexOf(transform)
      if (at !== -1) this.indexTaps.splice(at, 1)
    }
  }

  /**
   * Run an index.html body through the registered taps in registration order
   * — called by the fallback owner on every index response it renders.
   * @param html - the raw index.html body.
   * @returns the transformed body.
   */
  applyIndexTaps(html: string): string {
    let out = html
    for (const transform of this.indexTaps) out = transform(out)
    return out
  }

  /**
   * Gather the structured injection table: one `webserver/index-inject` emit,
   * every subscriber pushes its current rows. Fresh per call, so subscribers
   * read live state at emit time. Mirrors the web carrier so the same
   * frontend plugin renders identically over either transport.
   * @returns rows in subscriber activation order.
   */
  collectIndexInjections(): IndexInjection[] {
    const table: IndexInjection[] = []
    this.ctx.emit('webserver/index-inject', table)
    return table
  }

  /**
   * Render one index.html body: the structured injection table first, then
   * the raw `tapIndex` transforms over the result.
   * @param html - the raw index.html body.
   * @returns the transformed body.
   */
  renderIndex(html: string): string {
    return this.applyIndexTaps(renderIndexInjections(html, this.collectIndexInjections()))
  }

  /**
   * Dispatch one protocol request through the route tables and the fallback
   * seat — the app:// protocol handler's entry point. The handler receives a
   * node:http-shaped request/response pair; the shims collect the written
   * status, headers, and body into a plain `Response`.
   * @param request - the protocol Request (any URL; the pathname routes).
   * @returns the collected Response (404 when no route or fallback exists).
   */
  async dispatch(request: Request): Promise<Response> {
    let pathname: string
    try {
      pathname = new URL(request.url).pathname
    } catch {
      return new Response(null, { status: 400 })
    }
    const route = this.match(pathname)
    const target = route?.handler ?? this.fallback
    if (target === undefined) return new Response(null, { status: 404 })
    const res = new ShimResponse()
    try {
      // Handlers are typed against node:http req/res; the shims implement the
      // subset the web composition's /api bridge reads (async-iterable body,
      // response close/drain hooks, streamed write/end).
      await target(
        await shimRequest(request) as unknown as IncomingMessage,
        res as unknown as ServerResponse,
      )
      return res.toResponse()
    } catch (error) {
      this.ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
      if (res.headersSent) return new Response(null, { status: 500 })
      return new Response(null, { status: 400 })
    }
  }

  /** Longest-prefix-wins over the prefix table after an exact-table miss. */
  private match(pathname: string): WebRoute | undefined {
    const exact = this.exact.get(pathname)
    if (exact !== undefined) return exact
    let best: WebRoute | undefined
    for (const [prefix, route] of this.prefixes) {
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue
      if (best === undefined || prefix.length > best.path.length) best = route
    }
    return best
  }
}

/**
 * Collect a node:http-shaped response: writeHead/setHeader/write/end mutate
 * the shim, {@link toResponse} materializes it into a fetch Response.
 */
class ShimResponse extends EventEmitter implements DesktopResponse {
  private status = 200
  private readonly headers = new Map<string, string>()
  private readonly chunks: Buffer[] = []
  private trailing: unknown
  headersSent = false
  writableEnded = false

  writeHead(status: number, headers?: Record<string, string>): void {
    this.status = status
    this.headersSent = true
    if (headers !== undefined) {
      for (const [name, value] of Object.entries(headers)) this.headers.set(name.toLowerCase(), value)
    }
  }

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value)
  }

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk))
    return true
  }

  end(body?: unknown): void {
    if (typeof body === 'string' || body instanceof Uint8Array) {
      this.chunks.push(Buffer.from(body))
    } else if (body !== undefined) {
      this.trailing = body
    }
    this.writableEnded = true
  }

  toResponse(): Response {
    const headers: Record<string, string> = {}
    for (const [name, value] of this.headers) headers[name] = value
    const streamed = this.chunks.length > 0 ? Buffer.concat(this.chunks) : undefined
    const body = this.trailing !== undefined ? this.trailing : streamed
    return body === undefined
      ? new Response(null, { status: this.status, headers })
      : new Response(body as BodyInit, { status: this.status, headers })
  }
}

/**
 * Adapt a fetch Request to the node:http-shaped read surface handlers use.
 * Renderer traffic arrives over `app://dsh`, whose hostname is not loopback;
 * normalize Host to `127.0.0.1` and drop Origin so the shared `/api` trust
 * fence matches IPC-normalized desktop requests (see dsh-desktop ipc.ts).
 */
async function shimRequest(request: Request): Promise<IncomingMessage> {
  const url = new URL(request.url)
  const headers: Record<string, string> = {}
  request.headers.forEach((value, name) => {
    const lower = name.toLowerCase()
    if (lower === 'host' || lower === 'origin') return
    headers[lower] = value
  })
  headers.host = '127.0.0.1'
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? Buffer.alloc(0)
    : Buffer.from(await request.arrayBuffer())
  if (body.byteLength > 0 && headers['content-length'] === undefined) {
    headers['content-length'] = String(body.byteLength)
  }
  const stream = Readable.from(body.byteLength > 0 ? [body] : []) as unknown as IncomingMessage
  Object.assign(stream, {
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
  })
  return stream
}

export default DesktopWebServer
