/** Event-stream carrier selection and reconnect behavior for custom-scheme documents. */
import { expect, it, vi } from 'vitest'
import {
  canUseNativeEventSource, eventStreamFetch, followEventStream, readEventStream,
} from '../src/client/transport.ts'

it('prefers EventSource on http(s) documents and fetch on custom schemes', () => {
  expect(canUseNativeEventSource('http:')).toBe(true)
  expect(canUseNativeEventSource('https:')).toBe(true)
  expect(canUseNativeEventSource(undefined)).toBe(true)
  expect(canUseNativeEventSource('dsh-app:')).toBe(false)

  const fetch = vi.fn(async () => new Response(null, { status: 200 }))
  expect(eventStreamFetch('http:', fetch)).toBeUndefined()
  expect(eventStreamFetch(undefined, fetch)).toBeUndefined()
  const carrier = eventStreamFetch('dsh-app:', fetch)
  expect(carrier).toBeTypeOf('function')
})

it('reads the events route through the fetch carrier with a stream accept header', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 200 }))
  const carrier = eventStreamFetch('dsh-app:', fetch)!
  const controller = new AbortController()
  await readEventStream(carrier, controller.signal, () => {}).catch(() => {})
  expect(fetch).toHaveBeenCalledWith('plugins/events', expect.objectContaining({
    method: 'GET',
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  }))
})

it('reconnects after a failed stream and reports one error per outage', async () => {
  const encoder = new TextEncoder()
  let attempt = 0
  const fetch = vi.fn(async (_input: string, init: RequestInit) => {
    attempt += 1
    if (attempt === 1) throw new Error('connection refused')
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"rebuilt","id":"a","rev":"r1"}\n\n'))
        init.signal?.addEventListener('abort', () => { controller.close() })
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
  const received: string[] = []
  const report = vi.fn()
  const controller = new AbortController()
  const done = followEventStream(fetch, controller.signal, (data) => { received.push(data) }, report, 0)
  await vi.waitFor(() => { expect(received).toHaveLength(1) })
  controller.abort()
  await done
  expect(attempt).toBeGreaterThanOrEqual(2)
  expect(report).toHaveBeenCalledOnce()
  expect(report.mock.calls[0]?.[0]).toMatchObject({ message: 'connection refused' })
})

it('stays silent when disposal aborts an in-flight attempt', async () => {
  const report = vi.fn()
  const controller = new AbortController()
  const fetch = vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => { reject(new DOMException('aborted', 'AbortError')) })
  }))
  const done = followEventStream(fetch, controller.signal, () => {}, report, 0)
  await vi.waitFor(() => { expect(fetch).toHaveBeenCalledOnce() })
  controller.abort()
  await done
  expect(report).not.toHaveBeenCalled()
})
