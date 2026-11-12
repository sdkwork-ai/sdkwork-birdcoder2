// @vitest-environment jsdom
/** The app template center over a REAL generated SDK stack: a local stub
 * gateway serves the deployments app-api envelope, a real DeployHost builds
 * the real clients, and the IAM session hydrates only AFTER the flow mounted.
 * That ordering is the reported failure — the first dispatch ran without an
 * Access-Token and the surface stayed on the error forever — so the spec pins
 * the self-heal: the host notification re-syncs the private token manager,
 * rebuilds the clients, and the catalog + apps scan land with the token. */
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

/** Resolved by the gateway when the next catalog request lands. */
let resolveNextRequest: (() => void) | undefined

const MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'sdkwork-demo-h5', name: 'Demo H5', displayName: '演示 H5', appType: 'APP_REACT' },
  runtime: { family: 'mobile', framework: 'react-capacitor' },
  publish: { platforms: ['H5'] },
})

/** The stub gateway: catalog envelopes plus token recording. */
async function startGateway(): Promise<{
  url: string
  accessTokenSeen: string[]
  requests: string[]
  close: () => Promise<void>
}> {
  const accessTokenSeen: string[] = []
  const requests: string[] = []
  const json = (res: http.ServerResponse, data: unknown): void => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  const page = (items: unknown[]): unknown => ({ code: 0, data: { items, pageInfo: { totalItems: String(items.length), hasMore: false } } })
  const server = http.createServer((req, res) => {
    const token = req.headers['access-token']
    if (typeof token === 'string') accessTokenSeen.push(token)
    const url = (req.url ?? '').split('?')[0]
    requests.push(url)
    if (url === '/app/v3/api/apps') {
      json(res, page([{ id: 'app-1', name: '演示 H5', slug: 'sdkwork-demo-h5', appKind: 'SPA_WEB' }]))
    } else if (url === '/app/v3/api/app_templates') {
      json(res, page([]))
    } else if (url === '/app/v3/api/template_categories') {
      json(res, page([{ id: 'cat-1', displayName: '应用模板', status: 'ACTIVE' }]))
    } else {
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ code: 404, message: `unrouted ${url}` }))
    }
    const resolve = resolveNextRequest
    resolveNextRequest = undefined
    resolve?.()
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('gateway listen failed')
  return {
    url: `http://127.0.0.1:${address.port}`,
    accessTokenSeen,
    requests,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }),
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

/** Workspace port: one project with one independent app under apps/. */
function stubWorkspace(): DeployHostWorkspace {
  const files = new Map<string, string>([
    ['/proj/apps/sdkwork-demo-h5/agent.app.config.json', MANIFEST],
    ['/proj/apps/sdkwork-demo-h5/package.json', JSON.stringify({ version: '1.2.3' })],
  ])
  return {
    pickDirectory: () => Promise.resolve(undefined),
    listDirectory: (path) => {
      if (path === '/proj' || path === '/proj/apps') {
        return Promise.resolve({
          path: path ?? '',
          entries: [{
            name: 'sdkwork-demo-h5',
            path: '/proj/apps/sdkwork-demo-h5',
            hidden: false,
          }],
        })
      }
      return Promise.resolve({ path: path ?? '', entries: [] })
    },
    currentDirectory: () => '/proj',
    readTextFile: path => Promise.resolve(files.get(path) ?? ''),
  }
}

const THEME = { getColorScheme: () => 'dark' as const, subscribe: () => () => {} }

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

beforeEach(() => {
  gateway.accessTokenSeen.length = 0
  gateway.requests.length = 0
  resolveNextRequest = undefined
})

afterEach(async () => {
  const mountedRoot = root
  root = undefined
  // Unmounting is an update to the Root fiber: keep it inside act.
  if (mountedRoot !== undefined) await act(async () => { mountedRoot.unmount() })
  container?.remove()
  container = undefined
})

/** Arm the gateway to signal when the next catalog request lands. */
function armRequest(): Promise<void> {
  return new Promise<void>((resolve) => { resolveNextRequest = resolve })
}

async function mountFlow(host: DeployHost): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: PublishTemplateFlowProps = {
    host,
    theme: THEME,
    t: translate,
    directory: '/proj',
    onClose: () => {},
  }
  await act(async () => { root?.render(createElement(PublishTemplateFlow, props)) })
  // Flush the mount-effect microtasks (catalog + scan dispatch).
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
}

/** Flush pending I/O continuations inside act so their updates stay wrapped. */
async function flushRuns(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 25) }) })
}

describe('PublishTemplateFlow credential self-heal over a real SDK stack', () => {
  it('defers every dispatch while signed out and loads the catalog after late hydration', async () => {
    const iam = stubIam()
    const host = new DeployHost({
      env: { apiBaseUrl: () => gateway.url, accessToken: () => '', subscribe: () => () => {} },
      iam,
      workspace: stubWorkspace(),
    })
    host.mount()
    try {
      await mountFlow(host)

      // Signed out: the center shows the sign-in gate and touches no gateway.
      expect(container?.textContent).toContain('应用模板中心')
      expect(container?.textContent).toContain('登录后管理应用模板')
      expect(gateway.accessTokenSeen).toEqual([])
      expect(gateway.requests).toEqual([])
      // The dialog carries the host scheme for the dark token block.
      expect(container?.querySelector('[data-theme="dark"]')).not.toBeNull()

      // The IAM session hydrates late (bootstrap latency, token rotation):
      // the host notification re-syncs the private manager, rebuilds clients,
      // and the catalog + scan land with the Access-Token.
      const landed = armRequest()
      await act(async () => {
        iam.hydrate({ accessToken: ACCESS_TOKEN, authToken: 'auth-token', user: { id: 'u-1', displayName: '测试用户' } })
      })
      await act(async () => { await landed })
      await flushRuns()

      expect(container?.textContent).toContain('演示 H5')
      expect(container?.textContent).toContain('sdkwork-demo-h5')
      expect(container?.textContent).toContain('测试用户')
      expect(gateway.accessTokenSeen).toContain(ACCESS_TOKEN)
      expect(gateway.requests).toContain('/app/v3/api/app_templates')
      expect(gateway.requests).toContain('/app/v3/api/template_categories')
    } finally {
      host.dispose()
    }
  }, 30000)

  it('loads on the first dispatch when the session predates the mount', async () => {
    const iam = stubIam()
    const host = new DeployHost({
      env: { apiBaseUrl: () => gateway.url, accessToken: () => '', subscribe: () => () => {} },
      iam,
      workspace: stubWorkspace(),
    })
    host.mount()
    try {
      const landed = armRequest()
      iam.hydrate({ accessToken: ACCESS_TOKEN, authToken: 'auth-token', user: { id: 'u-1' } })
      await mountFlow(host)
      await act(async () => { await landed })
      await flushRuns()

      expect(container?.textContent).toContain('演示 H5')
      expect(container?.textContent).not.toContain('无法读取应用与模板信息')
      // The catalog reads (apps, templates, categories) all carry the token.
      expect(gateway.accessTokenSeen).toHaveLength(3)
      expect(gateway.accessTokenSeen.every(token => token === ACCESS_TOKEN)).toBe(true)
    } finally {
      host.dispose()
    }
  }, 30000)

  it('shows the unconfigured state instead of dispatching without a gateway', async () => {
    const iam = stubIam()
    const host = new DeployHost({
      env: { apiBaseUrl: () => '', accessToken: () => '', subscribe: () => () => {} },
      iam,
      workspace: stubWorkspace(),
    })
    host.mount()
    try {
      await mountFlow(host)
      expect(container?.textContent).toContain('当前部署未配置 SDKWork 服务地址')
      expect(gateway.requests).toEqual([])
    } finally {
      host.dispose()
    }
  }, 30000)
})
