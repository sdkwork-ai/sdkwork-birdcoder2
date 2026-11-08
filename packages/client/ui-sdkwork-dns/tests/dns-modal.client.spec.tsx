// @vitest-environment jsdom
/**
 * The domain modal frame: the three states it decides (unconfigured, signed
 * out, ready), its dismissal paths, and the environment-revision re-read. The
 * workspace's own behaviour is covered by `dns-workspace.client.spec.tsx`.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import { DnsModal, type DnsModalProps } from '../src/client/DnsModal.tsx'
import { zh, type DnsKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: DnsKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as DnsModalProps['t']

/** Client double: the empty zone list is enough for the frame test. */
function fakeClient(): SdkworkDeployAppClient {
  return {
    domain: {
      domainZones: { list: vi.fn(async () => ({ items: [], pageInfo: { mode: 'offset' } })) },
      cloudAccounts: { list: vi.fn(async () => ({ items: [], pageInfo: { mode: 'offset' } })) },
    },
  } as unknown as SdkworkDeployAppClient
}

interface State {
  open?: boolean
  available?: boolean
  signedIn?: boolean
  revision?: number
  client?: SdkworkDeployAppClient | undefined
}

function view(state: State = {}, props: Partial<DnsModalProps> = {}) {
  const readClient = vi.fn(() => (state.client === undefined ? fakeClient() : state.client))
  const composed = {
    open: state.open ?? true,
    onClose: () => {},
    host: { readReady: () => state.available ?? true, readClient },
    startSignIn: () => {},
    useAvailable: (select: (value: boolean) => boolean) => select(state.available ?? true),
    useSignedIn: (select: (value: boolean) => boolean) => select(state.signedIn ?? true),
    useRevision: (select: (value: number) => number) => select(state.revision ?? 0),
    t,
    ...props,
  } as DnsModalProps
  return render(<DnsModal {...composed} />)
}

describe('DnsModal', () => {
  it('renders nothing while closed', () => {
    view({ open: false })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('explains an unconfigured gateway instead of mounting the workspace', () => {
    const { getByText } = view({ available: false })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(getByText(zh['section.notConfigured'])).toBeTruthy()
  })

  it('offers sign-in while signed out and raises the shared surface', () => {
    const startSignIn = vi.fn()
    const { getByText } = view({ signedIn: false }, { startSignIn })
    expect(getByText(zh['section.signInRequired'])).toBeTruthy()
    fireEvent.click(getByText(zh['section.signIn']))
    expect(startSignIn).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).not.toContain(zh['zone.empty'])
  })

  it('falls back to the configuration notice when readiness races the client read', () => {
    const { getByText } = view({ available: true }, {
      host: { readReady: () => true, readClient: () => undefined },
    })
    expect(getByText(zh['section.notConfigured'])).toBeTruthy()
  })

  it('mounts the zone workspace once ready and signed in', async () => {
    const { findByText } = view()
    expect(await findByText(zh['zone.empty'])).toBeTruthy()
  })

  it('closes on Escape and on a mask click', () => {
    const onClose = vi.fn()
    view({}, { onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    const mask = document.querySelector('[aria-hidden="true"]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask as Element)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('re-reads the client when the environment revision moves', () => {
    const readClient = vi.fn(() => fakeClient())
    const props = {
      open: true,
      onClose: () => {},
      host: { readReady: () => true, readClient },
      startSignIn: () => {},
      useAvailable: (select: (value: boolean) => boolean) => select(true),
      useSignedIn: (select: (value: boolean) => boolean) => select(true),
      t,
    }
    const first = {
      ...props,
      useRevision: (select: (value: number) => number) => select(0),
    } as unknown as DnsModalProps
    const second = {
      ...props,
      useRevision: (select: (value: number) => number) => select(1),
    } as unknown as DnsModalProps
    const { rerender } = render(<DnsModal {...first} />)
    expect(readClient).toHaveBeenCalledTimes(1)
    rerender(<DnsModal {...second} />)
    expect(readClient).toHaveBeenCalledTimes(2)
  })
})
