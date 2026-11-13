// @vitest-environment jsdom
/** The standalone publish picker: canonical app roots, linked state, custom
 * directory, and explicit type selection before the publish flow. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DeployHost } from '../src/client/deployHost.ts'
import { DeployAppPicker, type DeployAppPickerProps } from '../src/client/DeployAppPicker.tsx'
import { readProjectAppState } from '../src/client/projectApp.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'

const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

const THEME = { getColorScheme: () => 'dark' as const, subscribe: () => () => {} }
const LOCALE_SNAPSHOT = { active: 'zh' }
const LOCALE = { getSnapshot: () => LOCALE_SNAPSHOT, subscribe: () => () => {} }

function translate(key: DeployKey, params?: Record<string, string>): string {
  let text: string = zh[key]
  for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, value)
  return text
}

function manifest(
  name: string,
  key: string,
  runtime: Record<string, unknown>,
  linked?: string,
  platforms: readonly string[] = ['WEB'],
): string {
  return JSON.stringify({
    schemaVersion: 3,
    kind: 'agent.app',
    app: { key, name, displayName: name, appType: 'APP_REACT' },
    runtime,
    publish: { platforms },
    metadata: linked === undefined ? {} : { publishing: { appIdByTarget: { 'standalone.development': linked } } },
  })
}

/** Host bridge with two app roots plus one custom directory. */
function stubHost(): DeployHost & { picked: string[] } {
  const picked: string[] = []
  const rootManifest = manifest('项目应用', 'project', { family: 'desktop', framework: 'electron' }, 'app-root')
  const h5Manifest = manifest('H5 应用', 'h5-app', { family: 'web', framework: 'react' }, undefined, ['H5'])
  const pcManifest = manifest('PC 应用', 'pc-app', { family: 'web', framework: 'react' })
  const tree: Record<string, { name: string; path: string; hidden: boolean }[]> = {
    '/proj': [
      { name: 'apps', path: '/proj/apps', hidden: false },
      { name: 'agent.app.config.json', path: '/proj/agent.app.config.json', hidden: false },
    ],
    '/proj/apps': [
      { name: 'h5-app', path: '/proj/apps/h5-app', hidden: false },
      { name: 'pc-app', path: '/proj/apps/pc-app', hidden: false },
    ],
    '/proj/apps/h5-app': [{ name: 'agent.app.config.json', path: '/proj/apps/h5-app/agent.app.config.json', hidden: false }],
    '/proj/apps/pc-app': [
      { name: 'agent.app.config.json', path: '/proj/apps/pc-app/agent.app.config.json', hidden: false },
      { name: 'apps', path: '/proj/apps/pc-app/apps', hidden: false },
    ],
    '/proj/apps/pc-app/apps': [],
  }
  const files: Record<string, string> = {
    '/proj/agent.app.config.json': rootManifest,
    '/proj/apps/h5-app/agent.app.config.json': h5Manifest,
    '/proj/apps/pc-app/agent.app.config.json': pcManifest,
  }
  const host = {
    readDefaultDirectory: () => '/proj',
    inspectDirectory: async (path?: string) => path === '/proj'
      ? {
        rootPath: '/proj',
        childDirectories: ['apps', 'agent.app.config.json'],
        appsChildDirectories: ['h5-app', 'pc-app'],
        surfaceChildDirectories: {},
      }
      : undefined,
    listDirectory: async (path: string) => tree[path] === undefined ? undefined : { path, entries: tree[path] },
    readTextFile: async (path: string) => files[path],
    readDeployProfileId: () => 'standalone.development',
    pickDirectory: async () => {
      picked.push('picked')
      return '/custom/app'
    },
    readProjectApp: async (path?: string) => {
      const byDirectory: Record<string, string | undefined> = {
        '/proj': rootManifest,
        '/proj/apps/h5-app': h5Manifest,
        '/proj/apps/pc-app': pcManifest,
        '/custom/app': h5Manifest,
      }
      return readProjectAppState(byDirectory[path ?? ''], { directory: path })
    },
  } as unknown as DeployHost & { picked: string[] }
  return Object.assign(host, { picked })
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

async function mount(host: DeployHost, onSelect = vi.fn()): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: DeployAppPickerProps = {
    host,
    theme: THEME,
    locale: LOCALE,
    t: translate,
    directory: '/proj',
    onSelect,
    onClose: () => {},
  }
  await act(async () => { root?.render(createElement(DeployAppPicker, props)) })
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 30) }) })
  return container
}

/** Choose one app type and advance to the matching source list. */
async function chooseType(element: HTMLElement, cardId: string): Promise<void> {
  expect(element.textContent).toContain('选择应用类型')
  const type = element.querySelector<HTMLButtonElement>(`button[data-card="${cardId}"]`)
  await act(async () => { type?.click() })
  const next = [...element.querySelectorAll('button')]
    .find(button => button.textContent === '下一步')
  await act(async () => { next?.click() })
}

describe('DeployAppPicker', () => {
  it('chooses the type first, then lists only matching app roots', async () => {
    const onSelect = vi.fn()
    const element = await mount(stubHost(), onSelect)
    await chooseType(element, 'h5')
    expect(element.textContent).toContain('H5 应用')
    expect(element.textContent).not.toContain('PC 应用')
    expect(element.textContent).not.toContain('项目应用')
    expect(element.querySelector('ul > li:first-child')?.textContent).toBe('+')

    const row = [...element.querySelectorAll('label')]
      .find(label => label.textContent?.includes('H5 应用'))
    const radio = row?.querySelector('input[type="radio"]') as HTMLInputElement | null
    await act(async () => { radio?.click() })
    expect(onSelect).not.toHaveBeenCalled()
    const next = [...element.querySelectorAll('button')]
      .find(button => button.textContent === '下一步')
    await act(async () => { next?.click() })
    expect(onSelect).toHaveBeenCalledWith('/proj/apps/h5-app', 'h5')
  }, 30000)

  it('adds a custom directory under the chosen type without a second type step', async () => {
    const onSelect = vi.fn()
    const element = await mount(stubHost(), onSelect)
    await chooseType(element, 'h5')
    expect(element.querySelector('ul > li:first-child')?.textContent).toBe('+')
    const pick = element.querySelector<HTMLButtonElement>('button[aria-label="添加自定义应用目录"]')
    await act(async () => { pick?.click() })
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 30) }) })
    expect(element.textContent).toContain('/custom/app')
    expect(element.textContent).toContain('将使用所选应用类型：H5 应用')

    const next = [...element.querySelectorAll('button')]
      .find(button => button.textContent === '下一步')
    await act(async () => { next?.click() })
    expect(onSelect).toHaveBeenCalledWith('/custom/app', 'h5')
  }, 30000)
})
