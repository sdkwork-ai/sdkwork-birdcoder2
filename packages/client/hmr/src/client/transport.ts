/**
 * Event-stream carrier selection and reconnect loop for the client HMR channel.
 * The document may be owned by a shell (a page tunnel) or served over a custom
 * scheme, where a native `EventSource` cannot open the stream even though
 * `fetch` streams it, so the two carriers share one reader.
 */
import { EventSourceParserStream } from 'eventsource-parser/stream'
import { EVENTS_ROUTE } from '../events.ts'

/** Request carrier a shell installs when it owns the page transport, such as the worker preview's tunnel. */
export type EventStreamFetch = (input: string, init: RequestInit) => Promise<Response>

/** Delay between event-stream reconnects after the carrier closes or fails. */
export const RECONNECT_DELAY_MS = 1_000

/**
 * Whether a document scheme can open a native `EventSource`. `EventSource`
 * requires an http(s) document; the Desktop shell serves the same page from
 * `dsh-app://app/`, where the browser refuses the connection after the headers
 * arrive (a net-level failure, not an HTTP status).
 * @param protocol - `location.protocol`, or undefined outside a document.
 * @returns true for http(s) or when no document scheme is known.
 */
export function canUseNativeEventSource(protocol: string | undefined): boolean {
  return protocol === undefined || protocol === 'http:' || protocol === 'https:'
}

/**
 * Resolve the fetch carrier a non-http document must use for the event stream.
 * @param protocol - `location.protocol`, or undefined outside a document.
 * @param fetchImpl - the page's fetch implementation.
 * @returns the carrier, or undefined when the document can use `EventSource`.
 */
export function eventStreamFetch(
  protocol: string | undefined,
  fetchImpl: (input: string, init: RequestInit) => Promise<Response>,
): EventStreamFetch | undefined {
  if (canUseNativeEventSource(protocol)) return undefined
  return (input, init) => fetchImpl(input, init)
}

/** An SSE reader over a fetch body; returns when the stream ends. */
export type EventStreamReader = (
  fetch: EventStreamFetch,
  signal: AbortSignal,
  receive: (data: string) => void,
) => Promise<void>

/**
 * Read the document-relative events route until it closes or `signal` aborts.
 * @param fetch - the request carrier.
 * @param signal - aborts the stream when the reader disposes.
 * @param receive - handles one SSE `data` payload.
 * @throws Error when the carrier refuses the stream or the stream ends while active.
 */
export async function readEventStream(
  fetch: EventStreamFetch,
  signal: AbortSignal,
  receive: (data: string) => void,
): Promise<void> {
  const response = await fetch(EVENTS_ROUTE, { method: 'GET', headers: { accept: 'text/event-stream' }, signal })
  if (!response.ok || response.body === null) {
    throw new Error(`client-hmr: ${EVENTS_ROUTE} answered ${String(response.status)}`)
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    receive(value.data)
  }
  if (!signal.aborted) throw new Error(`client-hmr: ${EVENTS_ROUTE} closed; client graph changes resume on reconnect`)
}

/**
 * Resolve after `milliseconds`, or immediately when `signal` aborts.
 * @param milliseconds - retry delay.
 * @param signal - the reader's lifetime signal.
 */
function waitBeforeRetry(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return }
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, milliseconds)
    signal.addEventListener('abort', done, { once: true })
  })
}

/** Read `signal.aborted` through a call so TypeScript's loop-entry narrowing cannot cache it. */
function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

/**
 * Follow the event stream for the reader's whole lifetime, reconnecting after a
 * closed or failed connection. A single failure is reported once per outage;
 * recovery is silent until the next outage.
 * @param fetch - the request carrier.
 * @param signal - the reader's lifetime signal.
 * @param receive - handles one SSE `data` payload.
 * @param report - receives the first error of an outage.
 * @param retryDelayMs - reconnect delay after a closed or failed stream.
 */
export async function followEventStream(
  fetch: EventStreamFetch,
  signal: AbortSignal,
  receive: (data: string) => void,
  report: (error: unknown) => void,
  retryDelayMs = RECONNECT_DELAY_MS,
): Promise<void> {
  let reported = false
  while (!isAborted(signal)) {
    try {
      await readEventStream(fetch, signal, (data) => { reported = false; receive(data) })
    } catch (error) {
      if (isAborted(signal)) return
      if (!reported) { reported = true; report(error) }
    }
    await waitBeforeRetry(retryDelayMs, signal)
  }
}
