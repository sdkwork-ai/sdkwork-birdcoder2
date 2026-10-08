// @vitest-environment jsdom
/** The publish-as-template flow over a REAL generated SDK stack: a local stub
 * gateway serves the deployments app-api envelope, a real DeployHost builds
 * the real clients, and the IAM session hydrates only AFTER the flow mounted.
 * That ordering is the reported failure — the first list dispatch ran without
 * an Access-Token and the picker stayed on the error forever — so the spec
 * pins the self-heal: the host notification re-syncs the private token
 * manager, remounts the picker, and the retried list lands with the token. */
import http from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { DeployHost, type DeployHostIam, type DeployHostIamSession, type DeployHostWorkspace } from '../src/client/deployHost.ts'
import { PublishTemplateFlow, type PublishTemplateFlowProps } from '../src/client/PublishTemplateFlow.tsx'
import { zh } from '../src/client/locales.ts'

// Hand-rolled act() outside testing-library requires the React 19 flag.
const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

const ACCESS_TOKEN = 'e2e-iam-token'

/** Resolved by the gateway when one GET /apps lands (per test, hand-rolled). */
let resolveNextApps: (() => void) | undefined

/** The stub gateway: the deployments list envelope plus token recording. */
async function startGateway(): Promise<{
  url: string
  accessTokenSeen: string[]
  close: () => Promise<void>
}> {
  const accessTokenSeen: string[] = []
  const json = (res: http.ServerResponse, data: unknown): void => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  const server = http.createServer((req, res) => {
    const token = req.headers['access-token']
    if (typeof token === 'string') accessTokenSeen.push(token)
    const url = (req.url ?? '').split('?')[0]
    if (url === '/app/v3/api/apps') {
      json(res, { code: 0, data: { items: [
        { id: 'app-1', name: 'Alpha 应用', slug: 'alpha', appStatus: 'DRAFT' },
      ], pageInfo: {} } })
      const resolve = resolveNextApps
      resolveNextApps = undefined
      resolve?.()
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ code: 404, message: `unrouted ${url}` }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('gateway listen failed')
  return {
    url: `http://127.0.0.1:${address.port}`,
    accessTokenSeen,
    close: () => new Promise<void>((resolve) => {
      server.close(() => { resolve() })
    }),
  }
}

/** Mutable IAM controller: the session hydrates only when the test says so. */
function stubIam(): DeployHostIam & { hydrate(session: DeployHostIamSession): void } {
  let session: DeployHostIamSession | null = null
  const listeners = new Set<() => void>()
  return {
    controller: {
      getState: () => ({ session }),
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    hydrate(next) {
      session = next
      for (const listener of listeners) listener()
    },
  }
}

/** Workspace port whose project manifest carries no deploy linkage. */
function stubWorkspace(): DeployHostWorkspace {
  return {
    pickDirectory: () => Promise.resolve(undefined),
    listDirectory: () => Promise.resolve({ path: '/', entries: [] }),
    currentDirectory: () => '/proj',
    readTextFile: () => Promise.resolve(''),
  }
}

const THEME = { getColorScheme: () => 'dark' as const, subscribe: () => () => {} }
// The snapshot must be reference-stable: useSyncExternalStore re-renders
// whenever getSnapshot returns a fresh object.
const LOCALE_SNAPSHOT = { active: 'zh' }
const LOCALE = { getSnapshot: () => LOCALE_SNAPSHOT, subscribe: () => () => {} }

/** The plugin's zh dictionary behind the flow's translate seat. */
function translate(key: keyof typeof zh, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

let gateway: Awaited<ReturnType<typeof startGateway>>
let root: Root | undefined
let container: HTMLElement | undefined

beforeAll(async () => { gateway = await startGateway() })
afterAll(async () => { await gateway.close() })

// The gateway accumulates across tests; every case asserts its own dispatches.
beforeEach(() => {
  gateway.accessTokenSeen.length = 0
  resolveNextApps = undefined
})

afterEach(async () => {
  const mountedRoot = root
  root = undefined
  // Unmounting is an update to the Root fiber: keep it inside act.
  if (mountedRoot !== undefined) await act(async () => { mountedRoot.unmount() })
  container?.remove()
  container = undefined
})

/** Arm the gateway to signal when the next list request lands. */
function armListRequest(): Promise<void> {
  return new Promise<void>((resolve) => { resolveNextApps = resolve })
}

async function mountFlow(host: DeployHost): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: PublishTemplateFlowProps = {
    host,
    theme: THEME,
    locale: LOCALE,
    t: translate,
    directory: '/proj',
    onClose: () => {},
    onPublished: () => {},
  }
  await act(async () => { root?.render(createElement(PublishTemplateFlow, props)) })
  // Flush the mount-effect microtasks (manifest resolve, first list dispatch).
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
}

/** Flush pending I/O continuations inside act so their updates stay wrapped. */
async function flushRuns(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 25) }) })
}

describe('PublishTemplateFlow credential self-heal over a real SDK stack', () => {
  it('recovers the app list when the IAM session hydrates after the flow mounted', async () => {
    const iam = stubIam()
    const host = new DeployHost({
      env: { apiBaseUrl: () => gateway.url, accessToken: () => '', subscribe: () => () => {} },
      iam,
      workspace: stubWorkspace(),
    })
    host.mount()
    try {
      await mountFlow(host)

      // The dialog opened (no manifest link) and the first list ran signed
      // out: the picker shows the load failure, and nothing reached the
      // gateway because the dispatch throws before the request.
      expect(container?.textContent).toContain('选择部署应用')
      expect(container?.textContent).toContain('non-open-api request requires Access-Token')
      expect(gateway.accessTokenSeen).toEqual([])
      // The picker surface carries the host scheme for the dark token block.
      expect(container?.querySelector('[data-theme="dark"]')).not.toBeNull()

      // The IAM session hydrates late (bootstrap latency, token rotation):
      // the host notification re-syncs the private manager and remounts the
      // picker, so the retried list dispatches with the Access-Token.
      const listLanded = armListRequest()
      await act(async () => {
        iam.hydrate({ accessToken: ACCESS_TOKEN, authToken: 'auth-token', user: { id: 'u-1' } })
      })
      await act(async () => { await listLanded })
      await flushRuns()

      expect(container?.textContent).toContain('Alpha 应用')
      expect(container?.textContent).not.toContain('non-open-api request requires Access-Token')
      expect(gateway.accessTokenSeen).toEqual([ACCESS_TOKEN])
    } finally {
      host.dispose()
    }
  }, 30000)

  it('loads the list on the first dispatch when the session predates the mount', async () => {
    const iam = stubIam()
    const host = new DeployHost({
      env: { apiBaseUrl: () => gateway.url, accessToken: () => '', subscribe: () => () => {} },
      iam,
      workspace: stubWorkspace(),
    })
    host.mount()
    try {
      const listLanded = armListRequest()
      iam.hydrate({ accessToken: ACCESS_TOKEN, authToken: 'auth-token', user: { id: 'u-1' } })
      await mountFlow(host)
      await act(async () => { await listLanded })
      await flushRuns()

      expect(container?.textContent).toContain('Alpha 应用')
      expect(container?.textContent).not.toContain('无法加载应用列表')
      expect(gateway.accessTokenSeen).toEqual([ACCESS_TOKEN])
    } finally {
      host.dispose()
    }
  }, 30000)
})
