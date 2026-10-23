// @vitest-environment jsdom
/**
 * Project publish flow over a REAL generated SDK stack: a local stub gateway
 * serves the deployments app-api envelope and a real DeployHost builds the
 * real clients, so the flow's create → link → platform-target chain and its
 * duplicate guard run end to end.
 *
 * The publish dialog itself is replaced by a marker component: this spec owns
 * the flow's state machine (which surface it lands on and what it persists),
 * not the console form's internals.
 */
import http from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import { DeployHost, type DeployHostIam, type DeployHostIamSession, type DeployHostWorkspace } from '../src/client/deployHost.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'
import {
  DeployProjectAppFlow,
  type DeployProjectAppFlowProps,
  type ProjectAppFlowOutcome,
} from '../src/client/DeployProjectAppFlow.tsx'

vi.mock('../src/client/DeployPublishDialog.tsx', async () => {
  const { createElement: h } = await import('react')
  return {
    DeployPublishDialog: (props: { app?: { id?: string } }) =>
      h('div', null, `PUBLISH_DIALOG:${props.app?.id ?? 'none'}`),
  }
})

// Hand-rolled act() outside testing-library requires the React 19 flag.
const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

const ACCESS_TOKEN = 'e2e-iam-token'
const CONFIG_PATH = '/w/app/sdkwork.app.config.json'

/** One deploy_app response the gateway serves for retrievals. */
function app(overrides: Partial<AppResponse> = {}): AppResponse {
  return {
    id: 'app-uuid-1',
    name: 'SDKWork Store',
    slug: 'sdkwork-store',
    appKind: 'SPA_WEB',
    appStatus: 'DRAFT',
    defaultEnvironment: 'development',
    ownerType: 'USER',
    tenantId: '100001',
    nginxConfigOverridden: false,
    createdAt: '2026-10-03T00:00:00.000Z',
    updatedAt: '2026-10-03T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

/** Stub gateway state shared with each test through {@link gateway}. */
interface GatewayState {
  /** Apps retrievable by id. */
  readonly apps: Map<string, AppResponse>
  /** Bodies of `POST /apps`, in order. */
  readonly created: Record<string, unknown>[]
  /** Paths of platform-target creations, in order. */
  readonly targets: string[]
  /** Force platform-target creation to fail. */
  failTargets: boolean
}

let gatewayState: GatewayState

/** The stub gateway: deployments app-api envelope over a real HTTP server. */
async function startGateway(): Promise<{ url: string; close: () => Promise<void>; tokenSeen: string[] }> {
  const tokenSeen: string[] = []
  const json = (res: http.ServerResponse, status: number, data: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
  }
  const server = http.createServer((req, res) => {
    const token = req.headers['access-token']
    if (typeof token === 'string') tokenSeen.push(token)
    const url = (req.url ?? '').split('?')[0] ?? ''
    const segments = url.split('/').filter(Boolean)
    // /app/v3/api/apps[/<id>[/platform_targets]]
    const appsIndex = segments.indexOf('apps')
    if (appsIndex === -1) {
      json(res, 404, { code: 404, message: `unrouted ${url}` })
      return
    }
    const rest = segments.slice(appsIndex + 1)
    if (rest.length === 0) {
      if (req.method === 'POST') {
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
        req.on('end', () => {
          const parsed = JSON.parse(body) as Record<string, unknown>
          gatewayState.created.push(parsed)
          const created = app({
            name: typeof parsed['name'] === 'string' ? parsed['name'] : 'Created app',
            appKind: parsed['appKind'] as AppResponse['appKind'],
            slug: typeof parsed['slug'] === 'string' ? parsed['slug'] : 'created-app',
          })
          gatewayState.apps.set(created.id, created)
          json(res, 200, { code: 0, data: created })
        })
        return
      }
      json(res, 200, { code: 0, data: { items: [...gatewayState.apps.values()], pageInfo: {} } })
      return
    }
    const appId = rest[0] ?? ''
    if (rest[1] === 'platform_targets' && req.method === 'POST') {
      if (gatewayState.failTargets) {
        json(res, 500, { code: 500, message: 'platform target registration failed' })
        return
      }
      gatewayState.targets.push(url)
      json(res, 200, { code: 0, data: { id: 'target-1' } })
      return
    }
    const found = gatewayState.apps.get(appId)
    if (found === undefined) {
      json(res, 404, { code: 404, message: 'app not found' })
      return
    }
    json(res, 200, { code: 0, data: found })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('gateway listen failed')
  return {
    url: `http://127.0.0.1:${address.port}`,
    tokenSeen,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }),
  }
}

/** Mutable IAM controller with a session that exists before mount. */
function stubIam(): DeployHostIam {
  const session: DeployHostIamSession = { accessToken: ACCESS_TOKEN, authToken: 'auth-token', user: { id: 'u-1' } }
  return {
    controller: {
      getState: () => ({ session }),
      subscribe: () => () => {},
    },
  }
}

/** A v3 manifest for the project under test. */
function manifest(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    schemaVersion: 3,
    kind: 'sdkwork.app',
    app: {
      key: 'sdkwork-store',
      name: 'SDKWork Store',
      displayName: 'SDKWork 商店',
      description: 'Everything store.',
      appType: 'APP_REACT',
    },
    backend: { appId: 'sdkwork-store', tenantId: '100001' },
    runtime: { family: 'web', framework: 'react', defaultDeploymentProfile: 'standalone' },
    media: { icons: { primary: { url: 'https://cdn.sdkwork.com/store.png' } } },
    publish: { platforms: ['WEB'] },
    metadata: { deploymentConfig: 'etc/sdkwork.deployment.config.json' },
    ...overrides,
  }, null, 2)}\n`
}

/** Workspace port over an in-memory file map; `failWrites` forces linkage failures. */
function workspaceOf(files: Map<string, string>, failWrites: { value: boolean }): DeployHostWorkspace {
  return {
    pickDirectory: () => Promise.resolve(undefined),
    listDirectory: () => Promise.resolve({ path: '/', entries: [] }),
    currentDirectory: () => '/w/app',
    readTextFile: (path: string) => Promise.resolve(files.get(path) ?? ''),
    writeTextFile: (path: string, content: string) => {
      if (failWrites.value) return Promise.reject(new Error('disk full'))
      files.set(path, content)
      return Promise.resolve(path)
    },
  }
}

const THEME = { getColorScheme: () => 'dark' as const, subscribe: () => () => {} }
const LOCALE_SNAPSHOT = { active: 'zh' }
const LOCALE = { getSnapshot: () => LOCALE_SNAPSHOT, subscribe: () => () => {} }

/** The plugin's zh dictionary behind the flow's translate seat. */
function translate(key: DeployKey, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

let gateway: Awaited<ReturnType<typeof startGateway>>
let root: Root | undefined
let container: HTMLElement | undefined
const mountedHosts: DeployHost[] = []

beforeAll(async () => { gateway = await startGateway() })
afterAll(async () => { await gateway.close() })

beforeEach(() => {
  gatewayState = { apps: new Map(), created: [], targets: [], failTargets: false }
  gateway.tokenSeen.length = 0
})

afterEach(async () => {
  const mounted = root
  root = undefined
  if (mounted !== undefined) await act(async () => { mounted.unmount() })
  container?.remove()
  container = undefined
  for (const host of mountedHosts.splice(0)) host.dispose()
})

/** Flush pending I/O continuations inside act so their updates stay wrapped. */
async function flush(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 25) }) })
}

/** Poll until the rendered text satisfies the predicate (or fail after 2s). */
async function until(predicate: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return
    await flush()
  }
  throw new Error(`timed out waiting for ${what}; rendered: ${container?.textContent ?? ''}`)
}

/** The dialog's primary action button. */
function primary(): HTMLButtonElement {
  const buttons = [...(container?.querySelectorAll('button') ?? [])]
  const button = buttons.at(-1)
  if (button === undefined) throw new Error('no action button rendered')
  return button
}

interface Mounted {
  readonly files: Map<string, string>
  readonly outcomes: ProjectAppFlowOutcome[]
  readonly closes: { count: number }
}

/** Mount the flow over the gateway-backed host. */
async function mountFlow(options: {
  files?: Map<string, string>
  failWrites?: { value: boolean }
  intent?: 'publish' | 'upload'
} = {}): Promise<Mounted> {
  const files = options.files ?? new Map([[CONFIG_PATH, manifest()]])
  const failWrites = options.failWrites ?? { value: false }
  const host = new DeployHost({
    env: {
      apiBaseUrl: () => gateway.url,
      accessToken: () => '',
      environment: () => 'development',
      subscribe: () => () => {},
    },
    iam: stubIam(),
    workspace: workspaceOf(files, failWrites),
  })
  host.mount()
  mountedHosts.push(host)
  const outcomes: ProjectAppFlowOutcome[] = []
  const closes = { count: 0 }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: DeployProjectAppFlowProps = {
    host,
    theme: THEME,
    locale: LOCALE,
    t: translate,
    directory: '/w/app',
    intent: options.intent ?? 'publish',
    onDone: (outcome) => { outcomes.push(outcome) },
    onClose: () => { closes.count += 1 },
  }
  await act(async () => { root?.render(createElement(DeployProjectAppFlow, props)) })
  return { files, outcomes, closes }
}

describe('DeployProjectAppFlow', () => {
  it('creates, links, and registers the platform target for an unlinked project, then publishes', async () => {
    const mounted = await mountFlow()
    await until(() => container?.textContent?.includes('创建并继续发布') === true, 'the create confirmation')
    expect(container?.textContent).toContain('SDKWork 商店')
    await act(async () => { primary().click() })
    await until(() => container?.textContent?.includes('PUBLISH_DIALOG:app-uuid-1') === true, 'the publish dialog')

    expect(gatewayState.created).toHaveLength(1)
    expect(gatewayState.created[0]).toMatchObject({
      name: 'SDKWork 商店',
      appKind: 'SPA_WEB',
      // The console derives an ASCII slug; the CJK-only suffix is dropped.
      slug: 'sdkwork',
    })
    expect(gatewayState.targets).toEqual(['/app/v3/api/apps/app-uuid-1/platform_targets'])
    // The linkage is canonical: no top-level `deploy`, no backend overwrite.
    const written = JSON.parse(mounted.files.get(CONFIG_PATH) ?? '{}') as Record<string, unknown>
    expect(written['deploy']).toBeUndefined()
    expect((written['backend'] as Record<string, unknown>)['appId']).toBe('sdkwork-store')
    const publishing = (written['metadata'] as Record<string, unknown>)['publishing'] as Record<string, unknown>
    expect(publishing['appIdByTarget']).toEqual({ 'standalone.development': 'app-uuid-1' })
    expect((publishing['birdcoder'] as Record<string, unknown>)['appName']).toBe('SDKWork 商店')
    expect(mounted.outcomes).toEqual([{ text: '应用已创建：SDKWork 商店', tone: 'success' }])
    expect(mounted.closes.count).toBe(0)
  }, 30000)

  it('publishes a linked project directly, with no create step', async () => {
    gatewayState.apps.set('app-uuid-1', app())
    const mounted = await mountFlow({
      files: new Map([[CONFIG_PATH, manifest({
        metadata: {
          deploymentConfig: 'etc/sdkwork.deployment.config.json',
          publishing: { appIdByTarget: { 'standalone.development': 'app-uuid-1' }, birdcoder: { appName: 'SDKWork Store' } },
        },
      })]]),
    })
    await until(() => container?.textContent?.includes('PUBLISH_DIALOG:app-uuid-1') === true, 'the publish dialog')
    expect(container?.textContent).not.toContain('创建并继续发布')
    expect(gatewayState.created).toHaveLength(0)
    expect(mounted.files.get(CONFIG_PATH)).toContain('app-uuid-1')
  }, 30000)

  it('offers replacement creation when the recorded app no longer resolves', async () => {
    await mountFlow({
      files: new Map([[CONFIG_PATH, manifest({
        metadata: {
          deploymentConfig: 'etc/sdkwork.deployment.config.json',
          publishing: { appIdByTarget: { 'standalone.development': 'app-deleted' } },
        },
      })]]),
    })
    await until(() => container?.textContent?.includes('原关联的应用已不存在') === true, 'the stale notice')
    expect(container?.textContent).toContain('创建并继续发布')
  }, 30000)

  it('refuses creation when the project acquired an app before the click', async () => {
    const mounted = await mountFlow()
    await until(() => container?.textContent?.includes('创建并继续发布') === true, 'the create confirmation')
    // Another window links the project between the menu opening and the click.
    mounted.files.set(CONFIG_PATH, manifest({
      metadata: {
        deploymentConfig: 'etc/sdkwork.deployment.config.json',
        publishing: { appIdByTarget: { 'standalone.development': 'app-other' } },
      },
    }))
    await act(async () => { primary().click() })
    await until(() => mounted.closes.count === 1, 'the close after the duplicate guard')
    expect(gatewayState.created).toHaveLength(0)
    expect(mounted.outcomes).toEqual([{ text: '该项目已创建应用，已改为打开发布', tone: 'error' }])
  }, 30000)

  it('keeps the created app and retries only the linkage when the manifest write fails', async () => {
    const failWrites = { value: true }
    const mounted = await mountFlow({ failWrites })
    await until(() => container?.textContent?.includes('创建并继续发布') === true, 'the create confirmation')
    await act(async () => { primary().click() })
    await until(() => container?.textContent?.includes('重试写入项目关联') === true, 'the linkage retry')
    expect(gatewayState.created).toHaveLength(1)
    expect(mounted.outcomes).toEqual([])

    failWrites.value = false
    await act(async () => { primary().click() })
    await until(() => container?.textContent?.includes('PUBLISH_DIALOG:app-uuid-1') === true, 'the publish dialog')
    // Retrying the linkage must not create a second app.
    expect(gatewayState.created).toHaveLength(1)
    expect(mounted.outcomes).toEqual([{ text: '项目关联已写入：SDKWork 商店', tone: 'success' }])
  }, 30000)

  it('reports a failed platform target but still opens publish for the linked app', async () => {
    gatewayState.failTargets = true
    const mounted = await mountFlow()
    await until(() => container?.textContent?.includes('创建并继续发布') === true, 'the create confirmation')
    await act(async () => { primary().click() })
    await until(() => container?.textContent?.includes('PUBLISH_DIALOG:app-uuid-1') === true, 'the publish dialog')
    expect(mounted.outcomes).toEqual([{ text: '应用「SDKWork 商店」已创建，但平台目标登记失败', tone: 'error' }])
    const written = JSON.parse(mounted.files.get(CONFIG_PATH) ?? '{}') as Record<string, unknown>
    const publishing = (written['metadata'] as Record<string, unknown>)['publishing'] as Record<string, unknown>
    expect(publishing['appIdByTarget']).toEqual({ 'standalone.development': 'app-uuid-1' })
  }, 30000)

  it('renders nothing when the host has no SDKWork origin', async () => {
    // No SDK origin: the client construction throws before any request, and
    // the flow stays inert instead of mounting a dialog that cannot dispatch.
    const files = new Map([[CONFIG_PATH, manifest()]])
    const host = new DeployHost({
      env: { apiBaseUrl: () => '', accessToken: () => '', environment: () => 'development', subscribe: () => () => {} },
      iam: stubIam(),
      workspace: workspaceOf(files, { value: false }),
    })
    host.mount()
    mountedHosts.push(host)
    const outcomes: ProjectAppFlowOutcome[] = []
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const props: DeployProjectAppFlowProps = {
      host,
      theme: THEME,
      locale: LOCALE,
      t: translate,
      directory: '/w/app',
      onDone: (outcome) => { outcomes.push(outcome) },
      onClose: () => {},
    }
    await act(async () => { root?.render(createElement(DeployProjectAppFlow, props)) })
    // Without clients the flow renders nothing and never resolves.
    await flush()
    expect(container.textContent).toBe('')
    expect(outcomes).toEqual([])
    expect(files.get(CONFIG_PATH)).toBe(manifest())
  }, 30000)
})
