// @vitest-environment jsdom
/**
 * Session-header publish entry (`DeployPublishAction`): the trigger opens the
 * app library popup directly, the library's outcomes surface as the header
 * banner, and the entry renders nothing without deploy clients. The library
 * component is a marker here; its own behavior is covered by its spec.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DeployHost } from '../src/client/deployHost.ts'
import { zh, type DeployKey } from '../src/client/locales.ts'
import { DeployPublishAction } from '../src/client/DeployPublishAction.tsx'

vi.mock('../src/client/DeployAppLibraryDialog.tsx', async () => {
  const { createElement: h } = await import('react')
  return {
    DeployAppLibraryDialog: (props: {
      onDone?: (outcome: { text: string; tone: 'success' | 'error' }) => void
      onClose: () => void
    }) =>
      h('div', null,
        'LIBRARY',
        h('button', { type: 'button', onClick: () => props.onDone?.({ text: '应用已创建', tone: 'success' }) }, 'emit-outcome'),
        h('button', { type: 'button', onClick: props.onClose }, 'close-library')),
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

/** A host double exposing the reads the entry makes. */
function fakeHost(withClients = true): DeployHost {
  return {
    readClients: withClients
      ? () => ({ deployClient: {}, driveClient: {} })
      : () => { throw new Error('no SDKWork base URL') },
    subscribe: () => () => {},
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

/** Mount the header action and return the container. */
async function mount(host: DeployHost): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(DeployPublishAction, {
      host, theme: THEME, locale: LOCALE, t: translate,
    } as never))
  })
  return container
}

/** The library trigger button. */
function trigger(element: HTMLElement): HTMLButtonElement {
  const found = element.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
  if (found === null) throw new Error('the library trigger is missing')
  return found
}

describe('DeployPublishAction', () => {
  it('names the trigger the app library and opens the library popup on click', async () => {
    const element = await mount(fakeHost())
    const button = trigger(element)
    expect(button.getAttribute('aria-label')).toBe('应用库')
    expect(element.textContent).not.toContain('LIBRARY')
    await act(async () => { button.click() })
    expect(element.textContent).toContain('LIBRARY')
    expect(button.getAttribute('aria-expanded')).toBe('true')
  }, 30000)

  it('closes the library from its own close action', async () => {
    const element = await mount(fakeHost())
    await act(async () => { trigger(element).click() })
    const close = [...element.querySelectorAll('button')].find(item => item.textContent === 'close-library')
    await act(async () => { close?.click() })
    expect(element.textContent).not.toContain('LIBRARY')
  }, 30000)

  it('surfaces a library outcome as the header banner', async () => {
    const element = await mount(fakeHost())
    await act(async () => { trigger(element).click() })
    const emit = [...element.querySelectorAll('button')].find(item => item.textContent === 'emit-outcome')
    await act(async () => { emit?.click() })
    expect(document.body.textContent).toContain('应用已创建')
  }, 30000)

  it('renders nothing when the deploy clients cannot be built', async () => {
    const element = await mount(fakeHost(false))
    expect(element.textContent).toBe('')
  }, 30000)
})
