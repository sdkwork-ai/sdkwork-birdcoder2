// @vitest-environment jsdom
/**
 * App library dialog over a REAL DeployHost with an in-memory workspace: the
 * scan lists the manifest projects with name, type, linkage badge and path;
 * each row's right side mounts publish/upload on the shared flow and build on
 * the host build port; an empty scan renders the clickable placeholder; and
 * the footer's create form links a freshly created app to the session project
 * when it records none. The stacked surfaces are markers here; their own
 * behavior is covered by their specs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DeployHost, type DeployHostBuild } from '../src/client/deployHost.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'
import { DeployAppLibraryDialog, type DeployAppLibraryDialogProps } from '../src/client/DeployAppLibraryDialog.tsx'

vi.mock('../src/client/DeployProjectAppFlow.tsx', async () => {
  const { createElement: h } = await import('react')
  return {
    DeployProjectAppFlow: (props: { intent?: string; directory?: string; onClose: () => void }) =>
      h('div', null,
        `FLOW:${props.intent ?? 'publish'}:${props.directory ?? ''}`,
        h('button', { type: 'button', onClick: props.onClose }, 'close-flow')),
  }
})

/** Server apps the mocked publishing service answers listApps with. */
const serverApps: { id: string; name: string; slug: string; appKind: string }[] = []

/** Git bindings the mocked operations service records. */
const gitBindings: { appId: string; repoUrl: string; defaultBranch?: string }[] = []

vi.mock('@sdkwork/deployments-pc-console-publishing', async () => {
  const { createElement: h } = await import('react')
  return {
    CreateAppDialog: (props: {
      onCreated: (app: {
        id: string
        name: string
        slug: string
        appKind: string
      }, media?: { icon?: { url?: string } }) => void
      onClose: () => void
    }) =>
      h('div', null,
        'CREATE_FORM',
        h('button', {
          type: 'button',
          onClick: () => {
            // Creation persists server-side before the callback fires, so the
            // refresh's listApps sees the new app (the real contract).
            const app = { id: 'app-9', name: 'Nova', slug: 'nova', appKind: 'SPA_WEB' }
            serverApps.push(app)
            props.onCreated(app, { icon: { url: 'https://cdn.test/nova-icon.png' } })
          },
        }, 'create-app'),
        h('button', {
          type: 'button',
          onClick: () => {
            const app = { id: 'app-9', name: 'Nova', slug: 'nova', appKind: 'SPA_WEB' }
            serverApps.push(app)
            props.onCreated(app)
          },
        }, 'create-app-no-icon'),
        h('button', { type: 'button', onClick: props.onClose }, 'close-create')),
    BuildProgressDialog: (props: { cwd: string; onClose: () => void }) =>
      h('div', null,
        `BUILD:${props.cwd}`,
        h('button', { type: 'button', onClick: props.onClose }, 'close-build')),
    CreateDeployAppDialog: (props: { publishApp?: { id?: string }; onClose: () => void }) =>
      h('div', null,
        `PUBLISH_DIRECT:${props.publishApp?.id ?? 'none'}`,
        h('button', { type: 'button', onClick: props.onClose }, 'close-publish')),
    UploadSourceDialog: (props: { app: { id: string }; onUploaded: (summary: string) => void; onClose: () => void }) =>
      h('div', null,
        `UPLOAD_DIRECT:${props.app.id}`,
        h('button', { type: 'button', onClick: () => props.onUploaded('3 files') }, 'upload-done'),
        h('button', { type: 'button', onClick: props.onClose }, 'close-upload')),
    cardsOfAppKind: (appKind: string) => (appKind === 'SPA_WEB' ? [{ id: 'pc-web' }] : []),
    createDeployAppPublishingService: () => ({
      listApps: async () => ({ items: [...serverApps], pageInfo: {} }),
    }),
    createDeployAppOperationsService: () => ({
      connectGitSource: async (appId: string, input: { repoUrl: string; defaultBranch?: string }) => {
        const branch = input.defaultBranch === undefined ? {} : { defaultBranch: input.defaultBranch }
        gitBindings.push({ appId, repoUrl: input.repoUrl, ...branch })
        return { id: 'sr-1' }
      },
    }),
  }
})

// Hand-rolled act() outside testing-library requires the React 19 flag.
const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

/** Translate through the plugin's zh dictionary. */
function translate(key: DeployKey, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

const THEME = { getColorScheme: () => 'dark' as const, subscribe: () => () => {} }
const LOCALE_SNAPSHOT = { active: 'zh' }
const LOCALE = { getSnapshot: () => LOCALE_SNAPSHOT, subscribe: () => () => {} }

const STORE_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'store', name: 'store', displayName: 'Store', iconUrl: 'https://cdn.test/store.png' },
  runtime: { family: 'web', framework: 'react' },
  publish: { platforms: ['WEB'] },
  metadata: {
    publishing: {
      appIdByTarget: { 'standalone.development': 'app-uuid-1' },
      birdcoder: { appId: 'app-uuid-1', appName: 'Store' },
    },
  },
})

const TOOLS_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { name: 'tools', displayName: 'Tools' },
  runtime: { family: 'server' },
})

/** In-memory workspace state shared between the fake bridge and assertions. */
interface Workspace {
  readonly directories: string[]
  readonly files: Record<string, string>
  /** The current session cwd; null reads as "no directory" for the library. */
  cwd?: string | null
}

/** A real DeployHost over an in-memory workspace bridge. */
function hostOf(
  workspace: Workspace,
  build: DeployHostBuild | undefined = undefined,
  gate?: Promise<void>,
): DeployHost {
  const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))
  return new DeployHost({
    env: {
      apiBaseUrl: () => 'http://gateway.test',
      accessToken: () => 'token',
      subscribe: () => () => {},
    },
    iam: { controller: { getState: () => ({ session: null }), subscribe: () => () => {} } },
    workspace: {
      pickDirectory: async () => null,
      async listDirectory(path: string) {
        if (gate !== undefined) await gate
        if (!workspace.directories.includes(path)) throw new Error(`not a directory: ${path}`)
        const names = new Set<string>()
        for (const directory of workspace.directories) {
          if (directory !== path && parentOf(directory) === path) names.add(directory.slice(path.length + 1))
        }
        for (const file of Object.keys(workspace.files)) {
          if (parentOf(file) === path) names.add(file.slice(path.length + 1))
        }
        return {
          path,
          entries: [...names].map(name => ({ name, path: `${path}/${name}`, hidden: name.startsWith('.') })),
        }
      },
      currentDirectory: () => (workspace.cwd === null ? undefined : (workspace.cwd ?? '/w')),
      async readTextFile(path) {
        const raw = workspace.files[path]
        if (raw === undefined) throw new Error(`missing ${path}`)
        return raw
      },
      async writeTextFile(path, content) {
        workspace.files[path] = content
        return path
      },
    },
    ...(build === undefined ? {} : { build }),
  })
}

/** A no-op build double; the dialog never starts one (BuildProgressDialog is a marker). */
function fakeBuild(): DeployHostBuild {
  return {
    start: async request => ({ buildId: 'b1', command: 'npm run build', cwd: request.cwd }),
    follow: async () => {},
    cancel: async () => {},
  }
}

let root: Root | undefined
let container: HTMLElement | undefined

afterEach(async () => {
  const mounted = root
  root = undefined
  if (mounted !== undefined) await act(async () => { mounted.unmount() })
  container?.remove()
  container = undefined
  serverApps.length = 0
  gitBindings.length = 0
})

/** Flush the scan's continuations inside act. */
async function flush(rounds = 4): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
  }
}

/** Mount the library dialog and return the container. */
async function mount(
  host: DeployHost,
  overrides: Partial<DeployAppLibraryDialogProps> = {},
): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: DeployAppLibraryDialogProps = {
    host,
    theme: THEME,
    locale: LOCALE,
    t: translate,
    onClose: vi.fn(),
    ...overrides,
  }
  await act(async () => { root?.render(createElement(DeployAppLibraryDialog, props)) })
  return container
}

/** One button by its visible label, or the first whose label it contains. */
function button(element: HTMLElement, label: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')]
    .find(item => item.textContent === label)
    ?? [...element.querySelectorAll('button')].find(item => item.textContent?.includes(label))
  if (found === undefined) throw new Error(`button "${label}" is missing`)
  return found
}

describe('DeployAppLibraryDialog', () => {
  it('renders the scanning hint while the walk is in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const element = await mount(hostOf({ directories: ['/w'], files: {} }, undefined, gate))
    expect(element.textContent).toContain('正在扫描项目文件…')
    await act(async () => { release?.() })
    await flush()
    expect(element.textContent).toContain('发现 0 个应用')
  }, 30000)

  it('lists discovered projects with name, type, linkage badge, path and row actions', async () => {
    const element = await mount(hostOf({
      directories: ['/w', '/w/store', '/w/tools'],
      files: {
        '/w/store/agent.app.config.json': STORE_MANIFEST,
        '/w/tools/agent.app.config.json': TOOLS_MANIFEST,
      },
    }, fakeBuild()))
    await flush()
    expect(element.textContent).toContain('发现 2 个应用')
    expect(element.textContent).toContain('Store')
    expect(element.textContent).toContain('Tools')
    expect(element.querySelector('img')?.getAttribute('src')).toBe('https://cdn.test/store.png')
    expect(element.textContent).toContain('/w/store')
    expect(element.textContent).toContain('已关联：Store')
    expect(element.textContent).toContain('未关联应用')
    expect(element.textContent).toContain('API 服务')
    for (const label of ['发布', '上传代码', '打包']) {
      expect([...element.querySelectorAll('button')].filter(item => item.textContent === label)).toHaveLength(2)
    }
  }, 30000)

  it('hides the build action when the host has no build port', async () => {
    const element = await mount(hostOf({
      directories: ['/w', '/w/store'],
      files: { '/w/store/agent.app.config.json': STORE_MANIFEST },
    }))
    await flush()
    expect(button(element, '发布')).toBeDefined()
    expect([...element.querySelectorAll('button')].some(item => item.textContent === '打包')).toBe(false)
  }, 30000)

  it('renders the clickable placeholder for an empty scan and opens the create form from it', async () => {
    const element = await mount(hostOf({ directories: ['/w'], files: {} }))
    await flush()
    expect(element.textContent).toContain('还没有发现应用')
    expect(element.textContent).toContain('agent.app.config.json')
    await act(async () => { button(element, '点击新建应用').click() })
    expect(element.textContent).toContain('CREATE_FORM')
    await act(async () => { button(element, 'close-create').click() })
    expect(element.textContent).not.toContain('CREATE_FORM')
  }, 30000)

  it('opens the create form from the footer button', async () => {
    const element = await mount(hostOf({ directories: ['/w'], files: {} }))
    await flush()
    await act(async () => { button(element, '新建应用').click() })
    expect(element.textContent).toContain('CREATE_FORM')
  }, 30000)

  it('mounts the publish flow for the row directory and refreshes after it closes', async () => {
    const element = await mount(hostOf({
      directories: ['/w', '/w/store'],
      files: { '/w/store/agent.app.config.json': STORE_MANIFEST },
    }, fakeBuild()))
    await flush()
    await act(async () => { button(element, '发布').click() })
    expect(element.textContent).toContain('FLOW:publish:/w/store')
    await act(async () => { button(element, 'close-flow').click() })
    expect(element.textContent).not.toContain('FLOW:publish:/w/store')
    expect(element.textContent).toContain('Store')
  }, 30000)

  it('mounts the upload surface for the row directory', async () => {
    const element = await mount(hostOf({
      directories: ['/w', '/w/store'],
      files: { '/w/store/agent.app.config.json': STORE_MANIFEST },
    }, fakeBuild()))
    await flush()
    await act(async () => { button(element, '上传代码').click() })
    expect(element.textContent).toContain('FLOW:upload:/w/store')
  }, 30000)

  it('mounts the build progress surface for the row directory', async () => {
    const element = await mount(hostOf({
      directories: ['/w', '/w/store'],
      files: { '/w/store/agent.app.config.json': STORE_MANIFEST },
    }, fakeBuild()))
    await flush()
    await act(async () => { button(element, '打包').click() })
    expect(element.textContent).toContain('BUILD:/w/store')
  }, 30000)

  it('links a manually created app with a complete composed manifest and lists it after the rescan', async () => {
    const onDone = vi.fn()
    const workspace: Workspace = { directories: ['/w'], files: {} }
    const element = await mount(hostOf(workspace, fakeBuild()), { onDone })
    await flush()
    await act(async () => { button(element, '新建应用').click() })
    await act(async () => { button(element, 'create-app').click() })
    await flush()
    const text = workspace.files['/w/agent.app.config.json']
    expect(text).toBeDefined()
    const manifest = JSON.parse(text) as Record<string, unknown>
    // Complete APP_MANIFEST_SPEC v3 skeleton, not a linkage-only stub.
    for (const section of ['app', 'backend', 'runtime', 'media', 'publish', 'artifacts', 'release', 'security']) {
      expect(manifest[section], section).toBeTypeOf('object')
    }
    expect(manifest).toMatchObject({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { key: 'nova', name: 'Nova', appType: 'APP_REACT', iconUrl: 'https://cdn.test/nova-icon.png' },
      runtime: {
        family: 'web',
        framework: 'react',
        supportedDeploymentProfiles: ['standalone'],
        defaultDeploymentProfile: 'standalone',
      },
      publish: { platforms: ['WEB', 'H5'] },
      metadata: { deploymentConfig: 'etc/sdkwork.deployment.config.json' },
    })
    expect((manifest['metadata'] as Record<string, unknown>)['publishing'])
      .toMatchObject({ appIdByTarget: { 'standalone.development': 'app-9' } })
    expect(onDone).toHaveBeenCalledWith({ text: '应用已创建并关联当前项目：Nova', tone: 'success' })
    expect(element.textContent).toContain('Nova')
  }, 30000)

  it('reports plain creation when the session project already records an app', async () => {
    const onDone = vi.fn()
    const workspace: Workspace = {
      directories: ['/w'],
      files: { '/w/agent.app.config.json': STORE_MANIFEST },
    }
    const element = await mount(hostOf(workspace, fakeBuild()), { onDone })
    await flush()
    await act(async () => { button(element, '新建应用').click() })
    await act(async () => { button(element, 'create-app-no-icon').click() })
    await flush()
    expect(workspace.files['/w/agent.app.config.json']).toBe(STORE_MANIFEST)
    expect(onDone).toHaveBeenCalledWith({ text: '应用已创建：Nova', tone: 'success' })
  }, 30000)

  it('rescans in place when the session cwd moves while the dialog is open', async () => {
    const workspace: Workspace = { directories: ['/w'], files: {}, cwd: '/w' }
    const host = hostOf(workspace, fakeBuild())
    const element = await mount(host)
    await flush()
    expect(element.textContent).toContain('还没有发现应用')
    // Another session becomes current; the host forwards the change and the
    // library re-walks the new tree without closing.
    workspace.cwd = '/w2'
    workspace.directories.push('/w2', '/w2/store')
    workspace.files['/w2/store/agent.app.config.json'] = STORE_MANIFEST
    await act(async () => { host.notifyChange() })
    await flush()
    expect(element.textContent).toContain('发现 1 个应用')
    expect(element.textContent).toContain('Store')
  }, 30000)

  it('rescans in place when another surface writes a manifest under the same root', async () => {
    const workspace: Workspace = { directories: ['/w'], files: {}, cwd: '/w' }
    const host = hostOf(workspace, fakeBuild())
    const element = await mount(host)
    await flush()
    expect(element.textContent).toContain('还没有发现应用')
    // A row-menu flow creates and links an app under the same root; its
    // outcome reaches the library through the host change channel with no
    // cwd move and no reopen.
    workspace.directories.push('/w/store')
    workspace.files['/w/store/agent.app.config.json'] = STORE_MANIFEST
    await act(async () => { host.notifyChange() })
    await flush()
    expect(element.textContent).toContain('发现 1 个应用')
    expect(element.textContent).toContain('Store')
  }, 30000)

  it('lists caller-owned apps without a local manifest as unlinked-directory rows', async () => {
    serverApps.push({ id: 'srv-1', name: 'Orbit', slug: 'orbit', appKind: 'SPA_WEB' })
    const element = await mount(hostOf({ directories: ['/w'], files: {}, cwd: '/w' }, fakeBuild()))
    await flush()
    expect(element.textContent).toContain('发现 1 个应用')
    expect(element.textContent).toContain('Orbit')
    expect(element.textContent).toContain('未关联本地目录')
    expect(element.textContent).toContain('PC Web 应用')
    expect(button(element, '发布')).toBeDefined()
    expect(button(element, '上传代码')).toBeDefined()
    // No local directory: no build action on the server row.
    expect([...element.querySelectorAll('button')].some(item => item.textContent === '打包')).toBe(false)
  }, 30000)

  it('shows a created app in the list even when no session directory can host its manifest', async () => {
    const onDone = vi.fn()
    serverApps.push({ id: 'srv-1', name: 'Orbit', slug: 'orbit', appKind: 'SPA_WEB' })
    const workspace: Workspace = { directories: [], files: {}, cwd: null }
    const element = await mount(hostOf(workspace, fakeBuild()), { onDone })
    await flush()
    expect(element.textContent).toContain('Orbit')
    // Creating Nova lands no manifest (no session directory), but the server
    // merge answers the refresh with the new app: creation is never invisible.
    await act(async () => { button(element, '新建应用').click() })
    await act(async () => { button(element, 'create-app-no-icon').click() })
    await flush()
    expect(onDone).toHaveBeenCalledWith({ text: '应用已创建：Nova', tone: 'success' })
    expect(element.textContent).toContain('Nova')
    expect(element.textContent).toContain('Orbit')
    expect(element.textContent).toContain('发现 2 个应用')
  }, 30000)

  it('suppresses the server row of an app a local manifest already links', async () => {
    serverApps.push({ id: 'app-uuid-1', name: 'Store', slug: 'store', appKind: 'SPA_WEB' })
    const element = await mount(hostOf({
      directories: ['/w', '/w/store'],
      files: { '/w/store/agent.app.config.json': STORE_MANIFEST },
      cwd: '/w',
    }, fakeBuild()))
    await flush()
    expect(element.textContent).toContain('发现 1 个应用')
    expect(element.textContent).toContain('Store')
    expect(element.textContent).toContain('已关联：Store')
    expect(element.textContent).toContain('/w/store')
  }, 30000)

  it('shows the source badge for a manifest that records a source directory', async () => {
    const manifest = JSON.stringify({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { key: 'store', name: 'store', displayName: 'Store' },
      runtime: { family: 'web', framework: 'react' },
      publish: { platforms: ['WEB'] },
      metadata: {
        publishing: {
          birdcoder: { sourceDirectory: 'D:/workspace/store' },
        },
      },
    })
    const element = await mount(hostOf({
      directories: ['/w', '/w/store'],
      files: { '/w/store/agent.app.config.json': manifest },
      cwd: '/w',
    }, fakeBuild()))
    await flush()
    expect(element.textContent).toContain('源码：本地目录')
    expect(element.textContent).not.toContain('源码：Git')
  }, 30000)

  it('binds a git source end to end from the row through the source dialog', async () => {
    const onDone = vi.fn()
    const workspace: Workspace = {
      directories: ['/w', '/w/store'],
      files: { '/w/store/agent.app.config.json': STORE_MANIFEST },
      cwd: '/w',
    }
    const element = await mount(hostOf(workspace, fakeBuild()), { onDone })
    await flush()
    await act(async () => { button(element, '源码').click() })
    expect(element.textContent).toContain('源码绑定')
    await act(async () => { button(element, 'Git 仓库').click() })
    const urlInput = [...element.querySelectorAll('input')].find(item => item.placeholder === zh['template.git.urlPlaceholder'])
    if (urlInput === undefined) throw new Error('the git url input is missing')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value')?.set
      setter?.call(urlInput, 'https://github.com/sdkwork/store.git')
      urlInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { button(element, '保存').click() })
    await flush()
    expect(gitBindings).toEqual([{ appId: 'app-uuid-1', repoUrl: 'https://github.com/sdkwork/store.git' }])
    const link = JSON.parse(workspace.files['/w/store/agent.app.config.json']) as {
      metadata: { publishing: { birdcoder: Record<string, unknown> } }
    }
    expect(link.metadata.publishing.birdcoder['sourceGitUrl']).toBe('https://github.com/sdkwork/store.git')
    expect(onDone).toHaveBeenCalledWith({ text: '源码已绑定到平台并写入项目清单', tone: 'success' })
    // The stacked surface closed and the row now carries the git source badge.
    expect(element.textContent).toContain('源码：Git')
  }, 30000)
})
