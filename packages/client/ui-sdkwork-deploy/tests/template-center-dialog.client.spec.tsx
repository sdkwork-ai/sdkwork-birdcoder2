// @vitest-environment jsdom
/** The template center publish run: selection, settings, per-row progress,
 * success/failure summaries, and the dedupe refresh — over stub ports. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import type { DeployHost, DeployHostClients } from '../src/client/deployHost.ts'
import { TemplateCenterDialog, type TemplateCenterDialogProps } from '../src/client/TemplateCenterDialog.tsx'
import { zh } from '../src/client/locales.ts'

const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

const MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'sdkwork-demo-h5', name: 'Demo H5', displayName: '演示 H5', appType: 'APP_REACT' },
  runtime: { family: 'mobile', framework: 'react-capacitor' },
  publish: { platforms: ['H5'] },
})

/** Stub publish ports shared by the mocked adapter module. */
const state = vi.hoisted(() => ({
  apps: [{ id: 'app-1', name: '演示 H5', slug: 'sdkwork-demo-h5', appKind: 'SPA_WEB' }],
  templates: [] as unknown[],
  failCreate: false,
  calls: {} as Record<string, number>,
  record(name: string): void {
    state.calls[name] = (state.calls[name] ?? 0) + 1
  },
}))

vi.mock('../src/client/templatePorts.ts', () => ({
  createTemplatePublishPorts: () => ({
    listPlatformApps: async () => state.apps,
    createPlatformApp: async () => { state.record('createPlatformApp'); return state.apps[0] },
    createPlatformTarget: async () => { state.record('createPlatformTarget') },
    listTemplates: async () => state.templates,
    createTemplate: async (input: { templateKey: string; displayName: string }) => {
      state.record('createTemplate')
      if (state.failCreate) throw new Error('backend refused')
      return {
        id: 'tpl-1',
        appUuid: 'app-1',
        templateKey: input.templateKey,
        displayName: input.displayName,
        version: '0.1.0',
        status: 'DRAFT',
      }
    },
    updateTemplate: async () => { state.record('updateTemplate') },
    createVersion: async () => { state.record('createVersion') },
    submitTemplate: async () => { state.record('submitTemplate') },
    packApp: async () => {
      state.record('packApp')
      return {
        archive: new Blob(['zip'], { type: 'application/zip' }),
        fileCount: 3,
        totalBytes: 128,
        checksumSha256: 'checksum',
        listedFiles: 3,
        excludedSensitive: [],
      }
    },
    uploadArchive: async () => { state.record('uploadArchive'); return { artifactId: 'art-1' } },
    writeAppLink: async () => { state.record('writeAppLink'); return true },
  }),
  listOwnedPlatformApps: async () => state.apps,
  listOwnedTemplates: async () => state.templates,
  listTemplateCatalog: async () => [],
  createTemplateInstallPorts: () => ({}),
}))

function translate(key: keyof typeof zh, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

/** Host bridge over one project and one apps/ root. */
function stubHost(): DeployHost {
  const files = new Map<string, string>([
    ['/proj/apps/sdkwork-demo-h5/agent.app.config.json', MANIFEST],
    ['/proj/apps/sdkwork-demo-h5/package.json', JSON.stringify({ version: '1.2.3' })],
  ])
  return {
    listDirectory: async (path?: string) => ({
      path: path ?? '',
      entries: (path ?? '') === '/proj/apps'
        ? [{ name: 'sdkwork-demo-h5', path: '/proj/apps/sdkwork-demo-h5', hidden: false }]
        : [],
    }),
    readTextFile: async (path: string) => files.get(path),
    notifyChange: () => {},
  } as unknown as DeployHost
}

let root: Root | undefined
let container: HTMLElement | undefined

beforeEach(() => {
  state.failCreate = false
  state.calls = {}
  state.templates = []
})

afterEach(async () => {
  const mounted = root
  root = undefined
  if (mounted !== undefined) await act(async () => { mounted.unmount() })
  container?.remove()
  container = undefined
})

async function mount(): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: TemplateCenterDialogProps = {
    host: stubHost(),
    clients: {
      deployClient: {
        template: {
          templateCategories: {
            list: async () => ({
              items: [{ id: 'cat-1', displayName: '应用模板', status: 'ACTIVE' }],
              pageInfo: { hasMore: false },
            }),
          },
          appTemplateVersions: {
            list: async () => ({
              items: [{ id: 'ver-1', templateVersion: '2.3.4', artifactUuid: 'art-1' }],
              pageInfo: { hasMore: false },
            }),
          },
        },
      },
    } as unknown as DeployHostClients,
    theme: 'light',
    t: translate,
    directory: '/proj',
    currentUser: { id: 'u-1', displayName: '测试用户' },
    onClose: () => {},
  }
  await act(async () => { root?.render(createElement(TemplateCenterDialog, props)) })
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 30) }) })
}

/** Click a button by its visible text. */
async function click(text: string): Promise<void> {
  const button = [...(container?.querySelectorAll('button') ?? [])]
    .find(candidate => candidate.textContent?.trim() === text)
  if (button === undefined) throw new Error(`button not found: ${text}`)
  await act(async () => { button.click() })
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 40) }) })
}

describe('TemplateCenterDialog publish run', () => {
  it('publishes the selected app with the shared settings and reports the summary', async () => {
    await mount()
    expect(container?.textContent).toContain('演示 H5')
    expect(container?.textContent).toContain('已选 0 / 1 个应用')

    const checkbox = container?.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => { checkbox.click() })
    expect(container?.textContent).toContain('已选 1 / 1 个应用')

    await click('发布 1 个模板')
    expect(container?.textContent).toContain('已新建 1 个、更新 0 个模板')
    expect(state.calls.createTemplate).toBe(1)
    expect(state.calls.packApp).toBe(1)
    expect(state.calls.uploadArchive).toBe(1)
    expect(container?.textContent).toContain('已发布 v0.1.0')
  }, 30000)

  it('keeps a failed row visible with its localized error and no summary success', async () => {
    state.failCreate = true
    await mount()
    const checkbox = container?.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => { checkbox.click() })
    await click('发布 1 个模板')
    expect(container?.textContent).toContain('发布失败：backend refused')
    expect(container?.textContent).toContain('已新建 0 个、更新 0 个模板')
  }, 30000)

  it('switches to the install tab and back without losing the publish selection', async () => {
    await mount()
    const checkbox = container?.querySelector('input[type="checkbox"]') as HTMLInputElement
    await act(async () => { checkbox.click() })
    await click('从模板安装')
    expect(container?.textContent).toContain('安装位置')
    await click('发布为模板')
    expect(container?.textContent).toContain('已选 1 / 1 个应用')
  }, 30000)

  it('resolves the semantic latest version instead of the listing lock counter', async () => {
    state.templates = [{
      id: 'tpl-1',
      appUuid: 'app-1',
      templateKey: 'sdkwork-demo-h5',
      displayName: '演示 H5',
      status: 'DRAFT',
      latestVersionUuid: 'ver-1',
    }]
    await mount()
    expect(container?.textContent).toContain('已有模板 v2.3.4')
    expect(container?.textContent).toContain('本次发布 v2.3.5')
  }, 30000)

  it('blocks publishing until the operator selects an app', async () => {
    await mount()
    const publish = [...(container?.querySelectorAll('button') ?? [])]
      .find(candidate => candidate.textContent?.trim() === '发布 0 个模板')
    expect(publish?.disabled).toBe(true)
  }, 30000)
})
