/**
 * Cross-process hand-off for IAM deep links.
 *
 * A custom-scheme handler is a machine-wide association: the release build and
 * a development build register the same `birdcoder://` redirect, so the OS may
 * hand a callback to either process (the last `setAsDefaultProtocolClient`
 * call usually wins). A callback delivered to the process that did not start
 * the login finds no pending PKCE flow there and is ignored, while the real
 * initiator waits forever.
 *
 * This relay makes every running instance hear every callback: the process
 * that receives the OS URL broadcasts it to the other instances over loopback,
 * and each one hands it to its own renderer. Exactly one renderer holds the
 * pending flow and redeems the code; the others classify it as a stale/foreign
 * callback and ignore it. A short-lived spool file also carries the callback
 * to an instance that starts after the link arrived.
 *
 * The channel is local-only and authenticated: the registry directory is owned
 * by the current user (0700), each instance file carries a random token (0600),
 * the listener rejects non-loopback and unauthenticated requests, and only
 * absolute custom-scheme callback shapes accepted by `isCallback` are relayed.
 * The URL carries an authorization code, never a token.
 *
 * @module iam-deep-link-relay
 */

import { createHash, randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Header a peer must present with a relayed callback. */
export const IAM_DEEP_LINK_RELAY_HEADER = 'x-dsh-iam-relay'

/** How long a spooled callback may still sign a newly started instance in. */
export const IAM_DEEP_LINK_SPOOL_TTL_MS = 10 * 60_000

/** How long a started login's `state` stays routable to its process. */
export const IAM_DEEP_LINK_STATE_TTL_MS = 6 * 60_000

/** Subdirectory holding the `state`-to-owner registry. */
const STATE_DIRECTORY = 'states'

/** Bound on a state value copied from an authorize URL. */
const MAX_STATE_LENGTH = 512

/** Bound on one relayed URL body. */
const MAX_BODY_BYTES = 8 * 1024

/** Time allowed for one peer delivery; a missing peer must not stall the OS handler. */
const PEER_TIMEOUT_MS = 500

/** One peer instance registered for the same scheme. */
interface RelayInstance {
  pid: number
  endpoint: string
  token: string
  startedAt: number
}

/** One spooled callback. */
interface SpooledCallback {
  url: string
  at: number
}

/** One started login's owner, keyed by its OAuth `state`. */
interface StateOwner {
  endpoint: string
  token: string
  pid: number
  expiresAt: number
}

/** Options of {@link createIamDeepLinkRelay}. */
export interface IamDeepLinkRelayOptions {
  /** Shared identity of the scheme, normally the brand protocol. */
  identity: string
  /** Whether a URL is the IAM callback this relay may carry. */
  isCallback: (url: string) => boolean
  /** Hand one callback to this process's renderer. */
  deliver: (url: string) => void
  /** Shared directory; defaults to a per-user directory under the OS temp root. */
  directory?: string
  /** Clock, for tests. */
  now?: () => number
  /** Sink for swallowed relay diagnostics; omitted keeps them silent. */
  warn?: (line: string) => void
}

/** One process's relay handle. */
export interface IamDeepLinkRelay {
  /** Start listening, publish this instance, and drain the spool. */
  start(): Promise<void>
  /**
   * Remember the `state` of an authorization page this process just opened.
   *
   * The shell sees the authorize URL before the browser opens; recording its
   * state lets whichever process receives the callback route it directly to the
   * process that started the login, instead of broadcasting the code to every
   * instance.
   * @param url - the absolute hosted authorize URL.
   */
  registerLogin(url: string): void
  /** Share one callback this process just received from the OS. */
  share(url: string): void
  /** Stop listening and remove this instance's registry entry. */
  dispose(): Promise<void>
  /** Loopback endpoint while started, for diagnostics and tests. */
  endpoint(): string | undefined
}

/**
 * Whether an address is a loopback peer.
 * @param address - socket remote address.
 * @returns true for the IPv4/IPv6 loopback forms Node reports.
 */
function isLoopbackAddress(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Whether a process id still names a running process.
 * @param pid - process id from a registry entry.
 * @returns true when the process exists (EPERM still means it exists).
 */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Read a response body within the relay bound.
 * @param request - incoming request.
 * @returns the body text, or undefined when it exceeded the bound.
 */
async function readBoundedBody(request: IncomingMessage): Promise<string | undefined> {
  let bytes = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    bytes += buffer.length
    if (bytes > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Parse one JSON object without throwing.
 * @param text - document text.
 * @returns the object, or undefined when the text is not a JSON object.
 */
function jsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Create one process's relay. The relay is inert until {@link IamDeepLinkRelay.start}.
 * @param options - identity, callback test, renderer sink, and optional test seams.
 * @returns the relay handle.
 */
export function createIamDeepLinkRelay(options: IamDeepLinkRelayOptions): IamDeepLinkRelay {
  const now = options.now ?? Date.now
  const warn = options.warn ?? ((): void => {})
  const identityHash = createHash('sha256').update(options.identity).digest('hex').slice(0, 16)
  const directory = options.directory ?? join(tmpdir(), 'dsh-iam-deep-links', identityHash)
  const spoolDirectory = join(directory, 'spool')
  const stateDirectory = join(directory, STATE_DIRECTORY)
  const instanceFile = join(directory, `${String(process.pid)}-${randomUUID()}.json`)
  const token = randomUUID()
  let server: Server | undefined
  let endpoint: string | undefined
  let started = false
  let disposed = false

  /** Deliver one URL locally, never throwing into the transport. */
  const deliverLocal = (url: string): void => {
    try {
      options.deliver(url)
    } catch (error) {
      warn(`[iam-deep-links] delivery failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Remove registry entries whose process is gone. */
  const pruneInstances = async (): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(directory)
    } catch {
      return
    }
    for (const name of names) {
      if (!name.endsWith('.json') || name === instanceFile.slice(directory.length + 1)) continue
      const path = join(directory, name)
      try {
        const entry = jsonObject(await readFile(path, 'utf8')) as RelayInstance | undefined
        if (entry === undefined || typeof entry.pid !== 'number' || !processAlive(entry.pid)) {
          await rm(path, { force: true })
        }
      } catch {
        // A concurrently removed or half-written entry is not an error.
      }
    }
  }

  /** Remove spool entries past their signing-in window. */
  const pruneSpool = async (): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(spoolDirectory)
    } catch {
      return
    }
    for (const name of names) {
      const path = join(spoolDirectory, name)
      try {
        const entry = jsonObject(await readFile(path, 'utf8')) as SpooledCallback | undefined
        if (entry === undefined || typeof entry.at !== 'number' || now() - entry.at > IAM_DEEP_LINK_SPOOL_TTL_MS) {
          await rm(path, { force: true })
        }
      } catch {
        // Same as registry pruning: a racing reader is not a failure.
      }
    }
  }

  /** Remember a callback so an instance starting later can still redeem it. */
  const spool = async (url: string): Promise<void> => {
    try {
      await mkdir(spoolDirectory, { recursive: true, mode: 0o700 })
      const name = `${createHash('sha256').update(url).digest('hex')}.json`
      const path = join(spoolDirectory, name)
      try {
        await readFile(path)
        return
      } catch {
        // Not spooled yet.
      }
      await writeFile(path, `${JSON.stringify({ url, at: now() } satisfies SpooledCallback, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      })
    } catch (error) {
      warn(`[iam-deep-links] cannot spool a callback: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Send one URL to every other live instance. */
  const sendTo = async (entry: StateOwner | RelayInstance, url: string): Promise<boolean> => {
    if (typeof entry.pid === 'number' && !processAlive(entry.pid)) return false
    try {
      const response = await fetch(entry.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [IAM_DEEP_LINK_RELAY_HEADER]: entry.token },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(PEER_TIMEOUT_MS),
      })
      return response.ok
    } catch (error) {
      // A peer that quit between registry scan and delivery is expected.
      if ((error as Error).name !== 'AbortError') {
        warn(`[iam-deep-links] peer delivery failed: ${(error as Error).message}`)
      }
      return false
    }
  }

  const broadcast = async (url: string): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(directory)
    } catch {
      return
    }
    for (const name of names) {
      if (!name.endsWith('.json') || name === instanceFile.slice(directory.length + 1)) continue
      let entry: RelayInstance | undefined
      try {
        entry = jsonObject(await readFile(join(directory, name), 'utf8')) as RelayInstance | undefined
      } catch {
        continue
      }
      if (entry === undefined || typeof entry.endpoint !== 'string' || typeof entry.token !== 'string') continue
      await sendTo(entry, url)
    }
  }

  /** Read the OAuth `state` carried by an authorize or callback URL. */
  const stateOf = (url: string): string | undefined => {
    try {
      const state = new URL(url).searchParams.get('state')
      if (state === null) return undefined
      const trimmed = state.trim()
      return trimmed === '' || trimmed.length > MAX_STATE_LENGTH ? undefined : trimmed
    } catch {
      return undefined
    }
  }

  /** Registry path for one state (the file name hashes the state). */
  const stateFileOf = (state: string): string =>
    join(stateDirectory, `${createHash('sha256').update(state).digest('hex')}.json`)

  /** Remember which process owns a login state. */
  const registerState = async (state: string): Promise<void> => {
    if (endpoint === undefined || !started) return
    try {
      await mkdir(stateDirectory, { recursive: true, mode: 0o700 })
      const owner: StateOwner = { endpoint, token, pid: process.pid, expiresAt: now() + IAM_DEEP_LINK_STATE_TTL_MS }
      await writeFile(stateFileOf(state), `${JSON.stringify(owner, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    } catch (error) {
      warn(`[iam-deep-links] cannot register login state: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Resolve the live owner of one state. */
  const ownerOf = async (state: string): Promise<StateOwner | undefined> => {
    try {
      const entry = jsonObject(await readFile(stateFileOf(state), 'utf8')) as StateOwner | undefined
      if (entry === undefined || typeof entry.endpoint !== 'string' || typeof entry.token !== 'string'
        || typeof entry.pid !== 'number' || typeof entry.expiresAt !== 'number') return undefined
      if (entry.expiresAt <= now() || !processAlive(entry.pid)) return undefined
      return entry
    } catch {
      return undefined
    }
  }

  /** Remove expired or dead state entries. */
  const pruneStates = async (): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(stateDirectory)
    } catch {
      return
    }
    for (const name of names) {
      const path = join(stateDirectory, name)
      try {
        const entry = jsonObject(await readFile(path, 'utf8')) as StateOwner | undefined
        // A partial read while another process is writing is not expired state:
        // leave it for the next pass instead of deleting a live login.
        if (entry === undefined || typeof entry.expiresAt !== 'number' || typeof entry.pid !== 'number') continue
        if (entry.expiresAt <= now() || !processAlive(entry.pid)) {
          await rm(path, { force: true })
        }
      } catch {
        // A racing reader or writer owns this entry.
      }
    }
  }

  /** Route one callback to its owner, falling back to the broadcast. */
  const route = async (url: string): Promise<void> => {
    const state = stateOf(url)
    if (state !== undefined) {
      await pruneStates()
      const owner = await ownerOf(state)
      if (owner !== undefined) {
        if (owner.pid === process.pid) {
          // Same process: the local bridge already delivered it. Compare the
          // endpoint too, so tests and a future multi-listener process do not
          // mistake another relay instance for this one.
          if (owner.endpoint === endpoint) return
        }
        if (await sendTo(owner, url)) return
      }
    }
    await broadcast(url)
  }

  /** Handle one relayed callback request. */
  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'POST' || !isLoopbackAddress(request.socket.remoteAddress)
      || request.headers[IAM_DEEP_LINK_RELAY_HEADER] !== token) {
      response.writeHead(403).end()
      return
    }
    const body = await readBoundedBody(request)
    if (body === undefined) {
      response.writeHead(413).end()
      return
    }
    const document = jsonObject(body)
    const url = document?.url
    if (typeof url !== 'string' || !options.isCallback(url)) {
      response.writeHead(400).end()
      return
    }
    deliverLocal(url)
    response.writeHead(204).end()
  }

  /** Drain callbacks received while no instance was listening. */
  const drainSpool = async (): Promise<void> => {
    let names: string[]
    try {
      names = await readdir(spoolDirectory)
    } catch {
      return
    }
    for (const name of names) {
      try {
        const entry = jsonObject(await readFile(join(spoolDirectory, name), 'utf8')) as SpooledCallback | undefined
        if (entry !== undefined && typeof entry.url === 'string' && typeof entry.at === 'number'
          && now() - entry.at <= IAM_DEEP_LINK_SPOOL_TTL_MS && options.isCallback(entry.url)) {
          deliverLocal(entry.url)
        }
      } catch {
        // Skip a spool entry another instance is writing or cleaning.
      }
    }
  }

  return {
    async start() {
      if (started || disposed) return
      started = true
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 })
        server = createServer((request, response) => {
          void handleRequest(request, response).catch((error: unknown) => {
            warn(`[iam-deep-links] relay request failed: ${error instanceof Error ? error.message : String(error)}`)
            if (!response.headersSent) response.writeHead(500)
            response.end()
          })
        })
        await new Promise<void>((resolve, reject) => {
          server?.once('error', reject)
          server?.listen(0, '127.0.0.1', () => { resolve() })
        })
        const address = server.address() as AddressInfo | null
        if (address === null || typeof address.port !== 'number') throw new Error('relay listener has no port')
        endpoint = `http://127.0.0.1:${String(address.port)}/deliver`
        const instance: RelayInstance = { pid: process.pid, endpoint, token, startedAt: now() }
        await writeFile(instanceFile, `${JSON.stringify(instance, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
        await pruneInstances()
        await pruneSpool()
        await pruneStates()
        await drainSpool()
      } catch (error) {
        // A relay that cannot start must not take the application down: the
        // local protocol handler still works for the process that owns it.
        started = false
        await this.dispose()
        warn(`[iam-deep-links] relay unavailable: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
    registerLogin(url) {
      if (disposed || !started) return
      try {
        if (!new URL(url).pathname.endsWith('/iam/oauth/authorize')) return
      } catch {
        return
      }
      const state = stateOf(url)
      if (state !== undefined) void registerState(state)
    },
    share(url) {
      if (disposed || !options.isCallback(url)) return
      void spool(url)
      void route(url)
    },
    async dispose() {
      if (disposed) return
      disposed = true
      server?.close()
      server = undefined
      endpoint = undefined
      await rm(instanceFile, { force: true }).catch(() => {})
    },
    endpoint() {
      return endpoint
    },
  }
}
