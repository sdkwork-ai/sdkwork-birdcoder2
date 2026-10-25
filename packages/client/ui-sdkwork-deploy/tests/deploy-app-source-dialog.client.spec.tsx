// @vitest-environment jsdom
/**
 * Source binding dialog over a REAL DeployHost with an in-memory workspace:
 * the local mode prefills from the manifest and persists `sourceDirectory`,
 * the git mode validates the https clone URL, binds through
 * `connectGitSource` when the manifest records an app (and skips the platform
 * call when it does not), and always records the git spec in the manifest.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DeployHost } from '../src/client/deployHost.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'
import { DeployAppSourceDialog, type DeployAppSourceDialogProps } from '../src/client/DeployAppSourceDialog.tsx'

/** Git bindings the mocked operations service records. */
const gitBindings: { appId: string; repoUrl: string; defaultBranch?: string }[] = []

vi.mock('@sdkwork/deployments-pc-console-publishing', async () => {
  const { createElement: h } = await import('react')
  void h
  return {
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

const STORE_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'sdkwork.app',
  app: { key: 'store', name: 'store', displayName: 'Store' },
  runtime: { family: 'web', framework: 'react' },
  publish: { platforms: ['WEB'] },
  metadata: {
    publishing: {
      appIdByTarget: { 'standalone.development': 'app-uuid-1' },
      birdcoder: { appId: 'app-uuid-1', appName: 'Store' },
    },
  },
})

/** In-memory workspace the real host bridge reads and writes. */
interface Workspace {
  readonly directories: string[]
  readonly files: Record<string, string>
  picked?: string
}

function hostOf(workspace: Workspace): DeployHost {
  const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))
  return new DeployHost({
    env: {
      apiBaseUrl: () => 'http://gateway.test',
      accessToken: () => 'token',
      subscribe: () => () => {},
    },
    iam: { controller: { getState: () => ({ session: null }), subscribe: () => () => {} } },
    workspace: {
      pickDirectory: async () => workspace.picked ?? null,
      async listDirectory(path: string) {
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
      currentDirectory: () => '/w',
      async readTextFile(path: string) {
        const raw = workspace.files[path]
        if (raw === undefined) throw new Error(`missing ${path}`)
        return raw
      },
      async writeTextFile(path: string, content: string) {
        workspace.files[path] = content
        return path
      },
    },
  })
}

let root: Root | undefined
let container: HTMLElement | undefined

afterEach(async () => {
  const mounted = root
  root = undefined
  if (mounted !== undefined) await act(async () => { mounted.unmount() })
  container?.remove()
  container = undefined
  gitBindings.length = 0
})

/** Flush the manifest read's continuation inside act. */
async function flush(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
}

/** Mount the source dialog for one project directory. */
async function mount(host: DeployHost, overrides: Partial<DeployAppSourceDialogProps> = {}): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: DeployAppSourceDialogProps = {
    host,
    directory: '/w/store',
    theme: 'dark',
    t: translate,
    onClose: vi.fn(),
    ...overrides,
  }
  await act(async () => { root?.render(createElement(DeployAppSourceDialog, props)) })
  return container
}

/** One button by its visible label. */
function button(element: HTMLElement, label: string): HTMLButtonElement {
  const found = [...element.querySelectorAll('button')].find(item => item.textContent === label)
  if (found === undefined) throw new Error(`button "${label}" is missing`)
  return found
}

/** Type into the input carrying one placeholder, the React-controlled way. */
async function typePlaceholder(element: HTMLElement, placeholder: string, value: string): Promise<void> {
  const input = [...element.querySelectorAll('input')].find(item => item.placeholder === placeholder)
  if (input === undefined) throw new Error(`input "${placeholder}" is missing`)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('DeployAppSourceDialog', () => {
  it('prefills the local directory from the project manifest and persists it', async () => {
    const onDone = vi.fn()
    const onClose = vi.fn()
    const workspace: Workspace = {
      directories: ['/w', '/w/store', '/w/elsewhere'],
      files: { '/w/store/sdkwork.app.config.json': STORE_MANIFEST },
      picked: '/w/elsewhere',
    }
    const element = await mount(hostOf(workspace), { onDone, onClose })
    await flush()
    const input = [...element.querySelectorAll('input')][0]
    expect(input?.value).toBe('/w/store')
    await act(async () => { await button(element, '浏览…').click() })
    expect([...element.querySelectorAll('input')][0]?.value).toBe('/w/elsewhere')
    await act(async () => { button(element, '保存').click() })
    await flush()
    const link = JSON.parse(workspace.files['/w/store/sdkwork.app.config.json']) as {
      metadata: { publishing: { birdcoder: Record<string, unknown> } }
    }
    expect(link.metadata.publishing.birdcoder['sourceDirectory']).toBe('/w/elsewhere')
    expect(onDone).toHaveBeenCalledWith({ text: '源码已记录到项目清单', tone: 'success' })
    expect(onClose).toHaveBeenCalledTimes(1)
  }, 30000)

  it('rejects a git URL without https', async () => {
    const workspace: Workspace = { directories: ['/w', '/w/store'], files: {} }
    const element = await mount(hostOf(workspace))
    await flush()
    await act(async () => { button(element, 'Git 仓库').click() })
    await typePlaceholder(element, zh['template.git.urlPlaceholder'], 'git@github.com:owner/repo.git')
    await act(async () => { button(element, '保存').click() })
    expect(element.textContent).toContain('请填写 https 开头的克隆地址')
    expect(Object.keys(workspace.files)).toEqual([])
  }, 30000)

  it('binds git on the platform for a linked app and records the spec in the manifest', async () => {
    const onDone = vi.fn()
    const workspace: Workspace = { directories: ['/w', '/w/store'], files: { '/w/store/sdkwork.app.config.json': STORE_MANIFEST } }
    const element = await mount(hostOf(workspace), { onDone })
    await flush()
    await act(async () => { button(element, 'Git 仓库').click() })
    await typePlaceholder(element, zh['template.git.urlPlaceholder'], 'https://github.com/sdkwork/store.git')
    await typePlaceholder(element, zh['template.git.branchPlaceholder'], 'main')
    await typePlaceholder(element, zh['template.git.subDirectoryPlaceholder'], 'apps/store-pc')
    await act(async () => { button(element, '保存').click() })
    await flush()
    expect(gitBindings).toEqual([{ appId: 'app-uuid-1', repoUrl: 'https://github.com/sdkwork/store.git', defaultBranch: 'main' }])
    const link = JSON.parse(workspace.files['/w/store/sdkwork.app.config.json']) as {
      metadata: { publishing: { birdcoder: Record<string, unknown> } }
    }
    expect(link.metadata.publishing.birdcoder).toMatchObject({
      sourceGitUrl: 'https://github.com/sdkwork/store.git',
      sourceGitBranch: 'main',
      sourceSubDirectory: 'apps/store-pc',
    })
    expect(onDone).toHaveBeenCalledWith({ text: '源码已绑定到平台并写入项目清单', tone: 'success' })
  }, 30000)

  it('records a git source manifest-only when the project records no app', async () => {
    const onDone = vi.fn()
    const workspace: Workspace = { directories: ['/w', '/w/store'], files: {} }
    const element = await mount(hostOf(workspace), { onDone })
    await flush()
    await act(async () => { button(element, 'Git 仓库').click() })
    expect(element.textContent).toContain('项目尚未关联应用')
    await typePlaceholder(element, zh['template.git.urlPlaceholder'], 'https://github.com/sdkwork/store.git')
    await act(async () => { button(element, '保存').click() })
    await flush()
    expect(gitBindings).toEqual([])
    const link = JSON.parse(workspace.files['/w/store/sdkwork.app.config.json']) as {
      metadata: { publishing: { birdcoder: Record<string, unknown> } }
    }
    expect(link.metadata.publishing.birdcoder['sourceGitUrl']).toBe('https://github.com/sdkwork/store.git')
    expect(onDone).toHaveBeenCalledWith({ text: '源码已记录到项目清单', tone: 'success' })
  }, 30000)
})
