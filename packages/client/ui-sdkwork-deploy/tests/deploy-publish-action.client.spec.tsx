// @vitest-environment jsdom
/**
 * Session-header publish entry (`DeployPublishAction`): the menu rows follow
 * the project manifest state, a registered project never offers creation, and
 * each row mounts the shared flow with the surface it names. The flow and the
 * template component are markers here; their own behavior is covered by their
 * specs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DeployHost } from '../src/client/deployHost.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'
import type { ProjectAppState } from '../src/client/projectApp.ts'
import { DeployPublishAction } from '../src/client/DeployPublishAction.tsx'

vi.mock('../src/client/DeployProjectAppFlow.tsx', async () => {
  const { createElement: h } = await import('react')
  return {
    DeployProjectAppFlow: (props: {
      intent?: string
      onClose: () => void
    }) => h('div', null,
      `FLOW:${props.intent ?? 'publish'}`,
      h('button', { type: 'button', onClick: props.onClose }, 'close-flow')),
  }
})

vi.mock('../src/client/PublishTemplateFlow.tsx', async () => {
  const { createElement: h } = await import('react')
  return {
    PublishTemplateFlow: (props: { onClose: () => void }) =>
      h('div', null, 'FLOW:template', h('button', { type: 'button', onClick: props.onClose }, 'close-template')),
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

/** A host double exposing the reads the header makes before a row is chosen. */
function fakeHost(state: ProjectAppState): DeployHost {
  return {
    readClients: () => ({ deployClient: {}, driveClient: {} }),
    subscribe: () => () => {},
    readProjectApp: async () => state,
    readDefaultDirectory: () => '/w/app',
  } as never
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

/** Flush the manifest read's continuation inside act. */
async function flush(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
}

/** Mount the header action over one project state. */
async function mount(state: ProjectAppState): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props = {
    host: fakeHost(state),
    theme: THEME,
    locale: LOCALE,
    t: translate,
  } as never
  await act(async () => { root?.render(createElement(DeployPublishAction, props)) })
  return container
}

/** Open the trigger's menu. */
async function openMenu(element: HTMLElement): Promise<void> {
  const trigger = element.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
  if (trigger === null) throw new Error('the publish trigger is missing')
  await act(async () => { trigger.click() })
  await flush()
}

/** Menu rows currently rendered in the body portal, by their accessible name. */
function rows(): string[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .map(row => row.textContent ?? '')
}

/** One menu row by its visible label, from the body portal. */
function row(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    .find(item => item.textContent === label)
  if (found === undefined) throw new Error(`menu row "${label}" is missing`)
  return found
}

describe('DeployPublishAction', () => {
  it('offers creation and publish as one row for a project without an app', async () => {
    const element = await mount({ hasManifest: true })
    await openMenu(element)
    expect(rows()).toEqual(['创建应用并发布'])
  }, 30000)

  it('shows the recorded app and only publish surfaces once the project owns one', async () => {
    const element = await mount({
      hasManifest: true,
      linkedAppId: 'app-uuid-1',
      link: { appId: 'app-uuid-1', appName: 'Alpha' },
    })
    await openMenu(element)
    expect(rows()).toEqual(['发布应用', '上传代码', '发布为模板'])
    expect(document.body.textContent).toContain('已创建应用：Alpha')
    expect(rows()).not.toContain('创建应用并发布')
  }, 30000)

  it('reads the project state before offering rows, then closes on a second trigger click', async () => {
    let resolveState: ((state: ProjectAppState) => void) | undefined
    const host = {
      readClients: () => ({ deployClient: {}, driveClient: {} }),
      subscribe: () => () => {},
      readProjectApp: () => new Promise<ProjectAppState>((resolve) => { resolveState = resolve }),
      readDefaultDirectory: () => '/w/app',
    } as never
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(DeployPublishAction, {
        host, theme: THEME, locale: LOCALE, t: translate,
      } as never))
    })
    await openMenu(container)
    expect(document.body.textContent).toContain('正在读取项目…')
    await act(async () => { resolveState?.({ hasManifest: false }) })
    await flush()
    expect(rows()).toEqual(['创建应用并发布'])
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
    await act(async () => { trigger?.click() })
    expect(rows()).toEqual([])
  }, 30000)

  it('mounts the project flow on its publish surface and closes it again', async () => {
    const element = await mount({ hasManifest: true })
    await openMenu(element)
    await act(async () => { row('创建应用并发布').click() })
    expect(element.textContent).toContain('FLOW:publish')
    const close = [...element.querySelectorAll('button')].find(button => button.textContent === 'close-flow')
    await act(async () => { close?.click() })
    expect(element.textContent).not.toContain('FLOW:publish')
  }, 30000)

  it('mounts the upload surface from a registered project and the template flow from its row', async () => {
    const element = await mount({
      hasManifest: true,
      linkedAppId: 'app-uuid-1',
      link: { appId: 'app-uuid-1', appName: 'Alpha' },
    })
    await openMenu(element)
    await act(async () => { row('上传代码').click() })
    expect(element.textContent).toContain('FLOW:upload')

    await openMenu(element)
    await act(async () => { row('发布为模板').click() })
    expect(element.textContent).toContain('FLOW:template')
    const close = [...element.querySelectorAll('button')].find(button => button.textContent === 'close-template')
    await act(async () => { close?.click() })
    expect(element.textContent).not.toContain('FLOW:template')
  }, 30000)
})
