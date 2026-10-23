// @vitest-environment jsdom
/**
 * Standalone publish surface (`DeployPublishDialog`): the linked app is passed
 * into the shared console dialog so its app-selection step is skipped, the
 * published result reaches the owner, and a host without an SDKWork origin
 * renders nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { AppResponse } from '@sdkwork/deployments-app-sdk'
import { DeployPublishDialog, type DeployPublishDialogProps } from '../src/client/DeployPublishDialog.tsx'

vi.mock('@sdkwork/deployments-pc-console-publishing', async () => {
  const { createElement: h } = await import('react')
  return {
    CreateDeployAppDialog: (props: {
      publishApp?: AppResponse
      onPublished?: (result: { app: AppResponse; media: unknown }) => void
      onClose: () => void
    }) => h('div', null,
      `CONSOLE:${props.publishApp?.id ?? 'none'}`,
      h('button', {
        type: 'button',
        onClick: () => { props.onPublished?.({ app: props.publishApp as AppResponse, media: {} }) },
      }, 'publish'),
      h('button', { type: 'button', onClick: props.onClose }, 'close')),
  }
})

// Hand-rolled act() outside testing-library requires the React 19 flag.
const actHost = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
actHost.IS_REACT_ACT_ENVIRONMENT = true

const APP = {
  id: 'app-uuid-1',
  name: 'SDKWork Store',
  slug: 'sdkwork-store',
} as never

const THEME = { getColorScheme: () => 'light' as const, subscribe: () => () => {} }
const LOCALE_SNAPSHOT = { active: 'en' }
const LOCALE = { getSnapshot: () => LOCALE_SNAPSHOT, subscribe: () => () => {} }

/** The host reads the dialog makes while mounted. */
interface HostFixture {
  readClients: () => { deployClient: unknown; driveClient: unknown }
  subscribe: (listener: () => void) => () => void
  readCurrentUser: () => { id: string; displayName: string } | undefined
  inspectDirectory: () => Promise<undefined>
  pickDirectory: () => Promise<undefined>
  readBuildPort: () => undefined
}

/** A host double whose client reads can be switched off mid-test. */
function fakeHost(options: { clients?: boolean } = {}): HostFixture & { notify(): void; setAvailable(value: boolean): void } {
  let available = options.clients ?? true
  const listeners = new Set<() => void>()
  return {
    readClients: () => {
      if (!available) throw new Error('no SDKWork base URL')
      return { deployClient: {}, driveClient: {} }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    readCurrentUser: () => undefined,
    inspectDirectory: async () => undefined,
    pickDirectory: async () => undefined,
    readBuildPort: () => undefined,
    notify: () => { for (const listener of listeners) listener() },
    setAvailable: (value) => { available = value },
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
})

/** Mount the publish dialog over a host double. */
async function mount(host: HostFixture & object, overrides: Partial<DeployPublishDialogProps> = {}): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const props: DeployPublishDialogProps = {
    host: host as never,
    theme: THEME,
    locale: LOCALE,
    onClose: () => {},
    ...overrides,
  }
  await act(async () => { root?.render(createElement(DeployPublishDialog, props)) })
  return container
}

describe('DeployPublishDialog', () => {
  it('hands the resolved app to the console dialog so it skips app selection', async () => {
    const element = await mount(fakeHost(), { app: APP as AppResponse })
    expect(element.textContent).toContain('CONSOLE:app-uuid-1')
  }, 30000)

  it('reports the published app and the close action to its owner', async () => {
    const onPublished = vi.fn()
    const onClose = vi.fn()
    const element = await mount(fakeHost(), { app: APP as AppResponse, onPublished, onClose })
    const publish = [...element.querySelectorAll('button')].find(button => button.textContent === 'publish')
    await act(async () => { publish?.click() })
    expect(onPublished).toHaveBeenCalledWith(APP)
    const close = [...element.querySelectorAll('button')].find(button => button.textContent === 'close')
    await act(async () => { close?.click() })
    expect(onClose).toHaveBeenCalledTimes(1)
  }, 30000)

  it('lets the console list apps when no linked app was resolved', async () => {
    const element = await mount(fakeHost(), {})
    expect(element.textContent).toContain('CONSOLE:none')
  }, 30000)

  it('renders nothing without an SDKWork origin and recovers when the host reports one', async () => {
    const host = fakeHost({ clients: false })
    const element = await mount(host, { app: APP as AppResponse })
    expect(element.textContent).toBe('')
    host.setAvailable(true)
    await act(async () => { host.notify() })
    expect(element.textContent).toContain('CONSOLE:app-uuid-1')
  }, 30000)
})
