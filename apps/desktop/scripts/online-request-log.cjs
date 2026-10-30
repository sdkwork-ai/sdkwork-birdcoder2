'use strict'

/**
 * Preloaded outbound-HTTP request log for the desktop online-debug launch
 * (`pnpm run dev:desktop:online`).
 *
 * The launch prepends this file to `NODE_OPTIONS` as `--require`, so the
 * Electron shell, the dsh Host, and every Node child they spawn load it before
 * their first import. It is inert unless `DSH_ONLINE_REQUEST_LOG=1`, and every
 * step after that guard is wrapped so a failure here can never break the
 * process it preloads into.
 *
 * Two transports are covered, without overlap: `global fetch` and every other
 * undici client fire the `undici:request:*` diagnostics channels, while
 * `node:http`/`node:https` callers (for example axios over the Node adapter)
 * go through the wrapped `request`/`get` exports — undici drives sockets
 * directly, so no request is logged twice. One line per request goes to
 * stderr: time, method, URL, status (or `!ERR`), duration. Headers and bodies
 * are never read, so credentials and payloads stay out of the log; renderer
 * traffic stays in the DevTools network panel as before.
 */

;(function activate() {
  if (process.env.DSH_ONLINE_REQUEST_LOG !== '1') return

  try {
    const started = new WeakMap()

    const stamp = () => new Date().toISOString().slice(11, 23)
    const duration = (entry) => `${String(Date.now() - entry.at)}ms`

    function emit(line) {
      try { process.stderr.write(`[online-request] ${stamp()} ${line}\n`) } catch { /* a closed stderr must not kill the host */ }
    }

    /** Describe one undici request or node:http ClientRequest as `METHOD URL`. */
    function describe(request) {
      if (!request) return 'unknown'
      const method = String(request.method ?? 'GET').toUpperCase()
      const path = String(request.path ?? '/')
      if (typeof request.getHeader === 'function') {
        // node:http exposes the endpoint through the Host header it already set.
        let protocol = String(request.protocol ?? 'http:')
        if (!protocol.endsWith(':')) protocol += ':'
        const host = String(request.getHeader('host') ?? request.host ?? 'unknown')
        return `${method} ${protocol}//${host}${path}`
      }
      if (request.origin !== undefined && request.origin !== '') {
        // undici carries the composed origin (`scheme://host[:port]`).
        return `${method} ${String(request.origin)}${path}`
      }
      let protocol = String(request.protocol ?? 'https:')
      if (!protocol.endsWith(':')) protocol += ':'
      const port = request.port
      const host = String(request.host ?? 'unknown')
        + (port !== undefined && port !== '' && Number(port) !== 80 && Number(port) !== 443 ? `:${String(port)}` : '')
      return `${method} ${protocol}//${host}${path}`
    }

    function track(request) {
      const entry = { at: Date.now(), label: describe(request) }
      started.set(request, entry)
      return entry
    }

    try {
      const diagnostics = require('node:diagnostics_channel')
      const created = diagnostics.channel('undici:request:create')
      const headers = diagnostics.channel('undici:request:headers')
      const failed = diagnostics.channel('undici:request:error')
      created.subscribe((message) => {
        if (message && message.request) track(message.request)
      })
      headers.subscribe((message) => {
        const entry = started.get(message && message.request)
        if (!entry) return
        emit(`${entry.label} -> ${String(message.response?.statusCode ?? '?')} (${duration(entry)})`)
      })
      failed.subscribe((message) => {
        const entry = message && message.request !== undefined ? started.get(message.request) : undefined
        const reason = String(message?.error?.message ?? message?.error?.code ?? 'request failed')
        if (entry) emit(`${entry.label} -> !ERR ${reason} (${duration(entry)})`)
        else emit(`!ERR ${reason}`)
      })
    } catch { /* diagnostics channels are unavailable on this runtime; the http wrapper below still logs */ }

    for (const name of ['node:http', 'node:https']) {
      try {
        const transport = require(name)
        for (const method of ['request', 'get']) {
          const original = transport[method]
          if (typeof original !== 'function') continue
          transport[method] = function patchedRequest() {
            const request = original.apply(this, arguments)
            try {
              const entry = track(request)
              request.once('response', (response) => {
                emit(`${entry.label} -> ${String(response.statusCode)} (${duration(entry)})`)
              })
              request.once('error', (error) => {
                emit(`${entry.label} -> !ERR ${String(error?.code ?? error?.message ?? 'request failed')} (${duration(entry)})`)
              })
            } catch { /* logging must never alter the request */ }
            return request
          }
        }
      } catch { /* the transport is unavailable; skip it */ }
    }
  } catch { /* the guard above already passed, but nothing here may break the preload */ }
})()
