// @vitest-environment jsdom
/** The install panel: catalog sources, target selection, and one install
 * driven through the real `installTemplateVersion` chain over stub clients. */
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import { strToU8, zipSync } from 'fflate'
import type { DeployHost, DeployHostClients } from '../src/client/deployHost.ts'
import { TemplateInstallPanel, type TemplateInstallPanelProps } from '../src/client/TemplateInstallPanel.tsx'
import { zh } from '../src/client/locales.ts'

const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

const MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'sdkwork-demo-h5', name: '演示 H5', displayName: '演示 H5', appType: 'APP_REACT' },
  runtime: { family: 'mobile', framework: 'react-capacitor' },
  publish: { platforms: ['H5'] },
})

const INDEX = `# apps/

| Directory | Surface role | Runnable | Purpose | Entry |
| --- | --- | --- | --- | --- |
| pc | pc | yes | PC | [README](pc/README.md) |
`

const ZIP = zipSync({
  'agent.app.config.json': strToU8(MANIFEST),
  'README.md': strToU8('# Demo\n'),
  'src/index.ts': strToU8('export {}\n'),
})

function translate(key: keyof typeof zh, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

/** Host bridge stub recording the install writes. */
function stubHost(): DeployHost & { readonly written: Map<string, string>; readonly files: Map<string, Uint8Array> } {
  const written = new Map<string, string>()
  const files = new Map<string, Uint8Array>()
  const host = {
    listDirectory: async (path?: string) => ({
      path: path ?? '',
      entries: (path ?? '').endsWith('/apps')
        ? [{ name: 'pc', path: `${path}/pc`, hidden: false }]
        : [],
    }),
    createDirectory: async (parent: string, name: string) => `${parent}/${name}`,
    readTextFile: async (path: string) => {
      if (path === '/proj/apps/README.md') return INDEX
      if (path.endsWith('/agent.app.config.json')) return MANIFEST
      if (path.endsWith('/README.md')) return '# Demo\n'
      return undefined
    },
    writeTextFile: async (path: string, content: string) => {
      written.set(path, content)
      return path
    },
    writeTemplateFile: async (request: { relativePath: string; contentBase64: string }) => {
      const bytes = Uint8Array.from(atob(request.contentBase64), char => char.charCodeAt(0))
      files.set(request.relativePath, bytes)
      return { absolutePath: request.relativePath, bytes: bytes.length }
    },
    writeDeployLink: async () => true,
    pickDirectory: async () => '/custom/apps/demo',
    readClients: () => { throw new Error('not used') },
    readCurrentUser: () => undefined,
    readDefaultDirectory: () => '/proj',
  } as unknown as DeployHost & { readonly written: Map<string, string>; readonly files: Map<string, Uint8Array> }
  return Object.assign(host, { written, files })
}

/** Generated-client stub carrying one installable template. */
function stubClients(): DeployHostClients {
  return {
    deployClient: {
      template: {
        appTemplates: {
          list: async () => ({
            items: [{
              id: 'tpl-1',
              appUuid: 'app-1',
              templateKey: 'sdkwork-demo-h5',
              displayName: '演示 H5',
              summary: 'Mobile web app',
              version: '7',
              status: 'PUBLISHED',
              installCount: '3',
              updatedAt: '2026-11-01T00:00:00Z',
              latestVersionUuid: 'ver-1',
            }],
            pageInfo: { hasMore: false },
          }),
          retrieve: async () => ({
            id: 'tpl-1',
            templateKey: 'sdkwork-demo-h5',
            displayName: '演示 H5',
            version: '7',
            latestVersionUuid: 'ver-1',
          }),
          submit: async () => { throw new Error('unused') },
          create: async () => { throw new Error('unused') },
          update: async () => { throw new Error('unused') },
        },
        appTemplateVersions: {
          list: async () => ({ items: [{ id: 'ver-1', templateVersion: '1.0.0', artifactUuid: 'art-1' }] }),
          create: async () => { throw new Error('unused') },
        },
        marketplaceTemplates: {
          list: async () => ({
            items: [{
              id: 'tpl-market',
              templateKey: 'sdkwork-market-h5',
              displayName: '市场模板',
              summary: 'From the marketplace',
              version: '3',
              status: 'PUBLISHED',
              installCount: '9',
              updatedAt: '2026-11-02T00:00:00Z',
            }],
            pageInfo: { hasMore: false },
          }),
        },
        templateCategories: { list: async () => ({ items: [], pageInfo: { hasMore: false } }) },
      },
      artifact: {
        retrieve: async () => ({ driveNodeId: 'node-1' }),
      },
    },
    driveClient: {
      drive: {
        nodes: {
          content: {
            retrieve: async () => ({
              content: Buffer.from(ZIP).toString('base64'),
              sizeBytes: ZIP.length,
              hasMore: false,
            }),
          },
        },
      },
    },
  } as unknown as DeployHostClients
}

let root: Root | undefined
let container: HTMLElement | undefined

afterEach(async () => {
  const mounted = root
  root = undefined
  if (mounted !== undefined) await act(async () => { mounted.unmount() })
  container?.remove()
  container = undefined
})

async function mount(host: DeployHost, clients: DeployHostClients): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: TemplateInstallPanelProps = {
    host,
    clients,
    directory: '/proj',
    t: translate,
  }
  await act(async () => { root?.render(createElement(TemplateInstallPanel, props)) })
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 20) }) })
}

/** Click one button by its visible text. */
async function click(text: string): Promise<void> {
  const button = [...(container?.querySelectorAll('button') ?? [])]
    .find(candidate => candidate.textContent?.trim() === text)
  if (button === undefined) throw new Error(`button not found: ${text}`)
  await act(async () => { button.click() })
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 30) }) })
}

async function clickAria(label: string): Promise<void> {
  const button = [...(container?.querySelectorAll('button') ?? [])]
    .find(candidate => candidate.getAttribute('aria-label') === label)
  if (button === undefined) throw new Error(`button not found by aria-label: ${label}`)
  await act(async () => { button.click() })
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 30) }) })
}

describe('TemplateInstallPanel', () => {
  it('lists the caller templates, previews the apps target, and installs into apps/ with the index update', async () => {
    const host = stubHost()
    await mount(host, stubClients())

    expect(container?.textContent).toContain('演示 H5')
    expect(container?.textContent).toContain('我的模板')
    expect(container?.textContent).toContain('/proj/apps/sdkwork-demo-h5')

    await click('安装')
    expect(container?.textContent).toContain('已安装')
    expect(container?.textContent).toContain('/proj/apps/sdkwork-demo-h5')
    expect([...host.files.keys()].sort()).toEqual(['README.md', 'agent.app.config.json', 'src/index.ts'])
    const index = host.written.get('/proj/apps/README.md')
    expect(index).toContain('| sdkwork-demo-h5 | h5 | yes | 演示 H5 | [README](sdkwork-demo-h5/README.md) |')
  }, 30000)

  it('searches the marketplace and installs into a picked custom directory', async () => {
    const host = stubHost()
    await mount(host, stubClients())
    await click('模板市场')
    expect(container?.textContent).toContain('市场模板')

    expect(container?.querySelectorAll('input[type="radio"]')).toHaveLength(0)
    expect(container?.textContent).toContain('默认安装目录')
    await clickAria('更改安装位置')
    expect(container?.textContent).toContain('自定义安装目录')
    expect(container?.textContent).toContain('/custom/apps/demo')

    await click('安装')
    expect(container?.textContent).toContain('已安装')
    expect(container?.textContent).toContain('/custom/apps/demo')
    // A custom target installs the archive only; no project index write.
    expect(host.written.has('/proj/apps/README.md')).toBe(false)
  }, 30000)
})
