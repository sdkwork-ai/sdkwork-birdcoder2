// @vitest-environment jsdom
/** The template center publish run: selection, settings, per-row progress,
 * success/failure summaries, and the dedupe refresh — over stub ports. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createElement } from 'react'
import type { DeployHost, DeployHostClients } from '../src/client/deployHost.ts'
import { TemplatePublishDialog, type TemplatePublishDialogProps } from '../src/client/TemplatePublishDialog.tsx'
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

const PC_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  kind: 'agent.app',
  app: { key: 'sdkwork-demo-pc', name: 'Demo PC', displayName: '演示 PC', appType: 'APP_REACT' },
  runtime: { family: 'desktop', framework: 'react' },
  publish: { platforms: ['PC'] },
})

/** Stub publish ports shared by the mocked adapter module. */
const state = vi.hoisted(() => ({
  apps: [{ id: 'app-1', name: '演示 H5', slug: 'sdkwork-demo-h5', appKind: 'SPA_WEB' }],
  templates: [] as unknown[],
  failCreate: false,
  lastCreate: undefined as {
    platformTargets?: readonly string[]
    description?: string
    iconMediaRef?: string
    coverMediaRef?: string
    screenshots?: readonly { mediaRef: string; sortOrder?: number }[]
  } | undefined,
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
    createTemplate: async (input: { templateKey: string; displayName: string; platformTargets?: readonly string[] }) => {
      state.record('createTemplate')
      state.lastCreate = input
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
    uploadMedia: async ({ file }: { file: File }) => {
      state.record('uploadMedia')
      return `drive://spaces/space-1/nodes/${file.name}`
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
  createCustomTemplateAppPort: (host: DeployHost) => ({
    listFiles: (directory: string) => host.listTemplateFiles(directory),
    readFiles: (directory: string, paths: readonly string[]) => host.readTemplateFiles(directory, paths),
  }),
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
    ['/proj/apps/sdkwork-demo-pc/agent.app.config.json', PC_MANIFEST],
    ['/proj/apps/sdkwork-demo-pc/package.json', JSON.stringify({ version: '3.0.0' })],
  ])
  return {
    listDirectory: async (path?: string) => ({
      path: path ?? '',
      entries: (path ?? '') === '/proj/apps'
        ? [
          { name: 'sdkwork-demo-h5', path: '/proj/apps/sdkwork-demo-h5', hidden: false },
          { name: 'sdkwork-demo-pc', path: '/proj/apps/sdkwork-demo-pc', hidden: false },
        ]
        : [],
    }),
    readTextFile: async (path: string) => files.get(path),
    notifyChange: () => {},
  } as unknown as DeployHost
}

/** Host bridge that also serves a picked Flutter directory outside the project. */
function customHost(): DeployHost {
  const files: Readonly<Record<string, string>> = {
    'pubspec.yaml': 'name: demo_flutter\nversion: 1.4.2\ndescription: Demo Flutter app\n',
    'lib/main.dart': 'void main() {}',
    'android/app/build.gradle': 'plugins {}',
    'ios/Runner/Info.plist': '<plist/>',
    'web/index.html': '<html/>',
  }
  const paths = Object.keys(files)
  const base = stubHost()
  return {
    ...base,
    pickDirectory: async () => '/work/demo-flutter',
    listTemplateFiles: async () => ({
      files: paths.map(path => ({ path, size: files[path]?.length ?? 0 })),
      truncated: false,
    }),
    readTemplateFiles: async (_directory: string, requested: readonly string[]) => requested
      .filter(path => files[path] !== undefined)
      .map(path => ({
        path,
        contentBase64: Buffer.from(files[path] ?? '', 'utf8').toString('base64'),
        bytes: files[path]?.length ?? 0,
      })),
  } as unknown as DeployHost
}

let root: Root | undefined
let container: HTMLElement | undefined

beforeEach(() => {
  state.failCreate = false
  state.lastCreate = undefined
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

async function mount(host: DeployHost = stubHost()): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: TemplatePublishDialogProps = {
    host,
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
  await act(async () => { root?.render(createElement(TemplatePublishDialog, props)) })
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

async function goToAssets(): Promise<void> {
  await click('下一步：商店素材')
}

async function goToBasic(): Promise<void> {
  await click('下一步：基本信息')
}

async function goToPublish(): Promise<void> {
  await click('下一步：版本与发布')
}

async function advanceToPublish(): Promise<void> {
  await goToAssets()
  await goToBasic()
  await goToPublish()
}

describe('TemplatePublishDialog publish run', () => {
  it('publishes the selected app with the shared settings and reports the summary', async () => {
    await mount()
    expect(container?.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('发布为模板')
    expect(container?.textContent).not.toContain('从模板安装')
    expect(container?.textContent).toContain('演示 H5')
    expect(container?.textContent).toContain('尚未选择应用')

    const radios = [...(container?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])]
    expect(radios.length).toBe(2)
    expect(container?.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    expect(container?.textContent).not.toContain('全选')
    await act(async () => { radios[0]?.click() })
    expect(radios[0]?.checked).toBe(true)
    await act(async () => { radios[1]?.click() })
    expect(radios[0]?.checked).toBe(false)
    expect(radios[1]?.checked).toBe(true)
    await act(async () => { radios[0]?.click() })
    expect(radios[0]?.checked).toBe(true)
    expect(radios[1]?.checked).toBe(false)

    await goToAssets()
    expect(container?.textContent).toContain('商店展示')
    expect(container?.textContent).toContain('Web / H5 列表素材规范')
    expect(container?.textContent).toContain('Web 1280 × 800')
    expect(container?.textContent).toContain('1600 × 900')
    await goToBasic()
    expect(container?.textContent).toContain('基本信息')
    await goToPublish()
    expect(container?.textContent).toContain('版本与发布')
    expect(container?.textContent).toContain('发布设置')

    const versionInput = [...(container?.querySelectorAll('input') ?? [])]
      .find(input => input.value === '0.1.0') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await act(async () => {
      setValue?.call(versionInput, 'not-semver')
      versionInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container?.textContent).toContain('请使用 1.2.3 形式的语义版本')
    const disabledPublish = [...(container?.querySelectorAll('button') ?? [])]
      .find(candidate => candidate.textContent?.includes('发布模板'))
    expect(disabledPublish?.disabled).toBe(true)
    await act(async () => {
      setValue?.call(versionInput, '0.1.0')
      versionInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await click('发布模板')
    expect(container?.textContent).toContain('发布完成')
    expect(container?.textContent).toContain('本次新建 1 个、更新 0 个模板')
    expect(state.calls.createTemplate).toBe(1)
    expect(state.calls.packApp).toBe(1)
    expect(state.calls.uploadArchive).toBe(1)

    await click('再发布一个')
    expect(container?.textContent).toContain('尚未选择应用')
    expect(container?.textContent).toContain('步骤 1 / 4')
  }, 30000)

  it('walks four focused publish steps without losing the app', async () => {
    await mount()
    const radio = container?.querySelector('input[type="radio"]') as HTMLInputElement
    await act(async () => { radio.click() })

    await goToAssets()
    expect(container?.textContent).toContain('步骤 2 / 4')
    expect(container?.textContent).toContain('商店展示')
    await goToBasic()
    expect(container?.textContent).toContain('步骤 3 / 4')
    expect(container?.textContent).toContain('基本信息')
    await goToPublish()
    expect(container?.textContent).toContain('步骤 4 / 4')
    expect(container?.textContent).toContain('版本与发布')
    expect(container?.textContent).toContain('发布摘要')
    expect(container?.textContent).toContain('演示 H5')
  }, 30000)

  it('keeps a failed publish visible with retry', async () => {
    state.failCreate = true
    await mount()
    const radio = container?.querySelector('input[type="radio"]') as HTMLInputElement
    await act(async () => { radio.click() })
    await advanceToPublish()
    await click('发布模板')
    expect(container?.textContent).toContain('发布失败')
    expect(container?.textContent).toContain('发布失败：backend refused')

    await click('重试')
    expect(state.calls.createTemplate).toBe(2)
    expect(state.calls.packApp).toBe(2)
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
    expect(container?.textContent).toContain('v2.3.4 → v2.3.5')
  }, 30000)

  it('keeps the wizard on step one until an app is selected', async () => {
    await mount()
    const next = [...(container?.querySelectorAll('button') ?? [])]
      .find(candidate => candidate.textContent?.includes('下一步'))
    expect(next?.disabled).toBe(true)
    expect(container?.textContent).toContain('步骤 1 / 4')
  }, 30000)

  it('detects and publishes a custom directory without fabricating a manifest', async () => {
    await mount(customHost())
    await click('自定义目录')
    expect(container?.textContent).toContain('从其他目录发布')

    await click('选择目录')
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80) }) })
    expect(container?.textContent).toContain('/work/demo-flutter')
    expect(container?.textContent).toContain('demo_flutter')
    expect(container?.textContent).toContain('Flutter 多端')

    await goToAssets()
    expect(container?.textContent).toContain('iOS 与 Android 双端商店素材规范')
    expect(container?.textContent).toContain('1024 × 500')
    expect(container?.textContent).toContain('iPhone')
    expect(container?.textContent).toContain('Android 手机')
    await goToBasic()
    await goToPublish()
    expect(container?.textContent).toContain('版本与发布')
    await click('发布模板')
    expect(container?.textContent).toContain('发布完成')
    expect(state.calls.createTemplate).toBe(1)
    expect(state.calls.uploadArchive).toBe(1)
    expect(state.calls.writeAppLink).toBeUndefined()
  }, 30000)

  it('uploads store images and persists description and sample pages', async () => {
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createObjectURL = vi.fn(() => 'blob:preview')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    await mount()
    const radio = container?.querySelector('input[type="radio"]') as HTMLInputElement
    await act(async () => { radio.click() })
    await goToAssets()

    const fileInputs = [...(container?.querySelectorAll('input[type="file"]') ?? [])] as HTMLInputElement[]
    expect(fileInputs).toHaveLength(3)
    const choose = async (input: HTMLInputElement | undefined, files: File[]) => {
      if (input === undefined) throw new Error('file input missing')
      Object.defineProperty(input, 'files', { configurable: true, value: files })
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    }
    await choose(fileInputs[0], [new File(['png'], 'logo.png', { type: 'image/png' })])
    await choose(fileInputs[1], [new File(['png'], 'cover.png', { type: 'image/png' })])
    await choose(fileInputs[2], [
      new File(['png'], 'page-1.png', { type: 'image/png' }),
      new File(['png'], 'page-2.png', { type: 'image/png' }),
    ])
    expect(container?.textContent).toContain('logo.png')
    expect(container?.textContent).toContain('cover.png')

    await goToBasic()
    const description = container?.querySelector('textarea[placeholder*="模板解决"]') as HTMLTextAreaElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      setValue?.call(description, '包含登录、导航和列表页。')
      description.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await goToPublish()
    await click('发布模板')
    expect(state.calls.uploadMedia).toBe(4)
    expect(state.lastCreate?.description).toBe('包含登录、导航和列表页。')
    expect(state.lastCreate?.iconMediaRef).toBe('drive://spaces/space-1/nodes/logo.png')
    expect(state.lastCreate?.coverMediaRef).toBe('drive://spaces/space-1/nodes/cover.png')
    expect(state.lastCreate?.screenshots).toEqual([
      { mediaRef: 'drive://spaces/space-1/nodes/page-1.png', device: 'web', sortOrder: 0 },
      { mediaRef: 'drive://spaces/space-1/nodes/page-2.png', device: 'web', sortOrder: 1 },
    ])
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL })
  }, 30000)

  it('shows existing store assets and validates type, size and sample-page count', async () => {
    state.templates = [{
      id: 'tpl-1',
      appUuid: 'app-1',
      templateKey: 'sdkwork-demo-h5',
      displayName: '演示 H5',
      summary: '旧简介',
      description: '旧描述',
      iconMediaRef: 'drive://spaces/s/nodes/logo',
      coverMediaRef: 'drive://spaces/s/nodes/cover',
      screenshots: [{ mediaRef: 'drive://spaces/s/nodes/page', sortOrder: 0 }],
      status: 'DRAFT',
    }]
    await mount()
    const radio = container?.querySelector('input[type="radio"]') as HTMLInputElement
    await act(async () => { radio.click() })
    await goToAssets()
    expect(container?.textContent).toContain('已上传 Logo')
    expect(container?.textContent).toContain('已上传封面图')
    expect(container?.textContent).toContain('已有 1 张示例页面')

    const fileInputs = [...(container?.querySelectorAll('input[type="file"]') ?? [])] as HTMLInputElement[]
    const choose = async (input: HTMLInputElement, files: File[]) => {
      Object.defineProperty(input, 'files', { configurable: true, value: files })
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    }
    await choose(fileInputs[0] as HTMLInputElement, [new File(['text'], 'notes.txt', { type: 'text/plain' })])
    expect(container?.textContent).toContain('仅支持 PNG、JPEG 或 WebP 图片')

    await choose(fileInputs[1] as HTMLInputElement, [
      new File([new Uint8Array(13 * 1024 * 1024)], 'huge.png', { type: 'image/png' }),
    ])
    expect(container?.textContent).toContain('超过 12 MB 限制')

    await choose(fileInputs[2] as HTMLInputElement, Array.from({ length: 11 }, (_, index) =>
      new File(['png'], `page-${index}.png`, { type: 'image/png' })))
    expect(container?.textContent).toContain('示例页面最多 10 张')
  }, 30000)

  it('lets the operator override the detected type before publishing', async () => {
    await mount(customHost())
    await click('自定义目录')
    await click('选择目录')
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80) }) })

    const typeSelect = container?.querySelector('select') as HTMLSelectElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    await act(async () => {
      setValue?.call(typeSelect, 'android')
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container?.textContent).toContain('Android 应用')
    expect(container?.textContent).toContain('已手动指定')

    await advanceToPublish()
    await click('发布模板')
    expect(state.lastCreate?.platformTargets).toEqual(['ANDROID'])
  }, 30000)
})
