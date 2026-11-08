// @vitest-environment jsdom
/**
 * The certificate modal frame: the three states it decides (unconfigured,
 * signed out, ready), its dismissal paths, and the environment-revision
 * re-read. The workspace's own behaviour is covered by
 * `certificate-workspace.client.spec.tsx`.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SdkworkDeployAppClient } from '@sdkwork/deployments-app-sdk'
import { CertificateModal, type CertificateModalProps } from '../src/client/CertificateModal.tsx'
import { zh, type CertificateKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: CertificateKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as CertificateModalProps['t']

/** Client double: the empty ledger is enough for the frame test. */
function fakeClient(): SdkworkDeployAppClient {
  return {
    certificate: { list: vi.fn(async () => ({ items: [], pageInfo: { mode: 'offset' } })) },
  } as unknown as SdkworkDeployAppClient
}

interface State {
  open?: boolean
  available?: boolean
  signedIn?: boolean
  revision?: number
}

function view(state: State = {}, props: Partial<CertificateModalProps> = {}) {
  const readClient = vi.fn(() => fakeClient())
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
  } as CertificateModalProps
  return render(<CertificateModal {...composed} />)
}

describe('CertificateModal', () => {
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
    expect(document.body.textContent).not.toContain(zh['cert.empty'])
  })

  it('falls back to the configuration notice when readiness races the client read', () => {
    const { getByText } = view({ available: true }, {
      host: { readReady: () => true, readClient: () => undefined },
    })
    expect(getByText(zh['section.notConfigured'])).toBeTruthy()
  })

  it('mounts the certificate workspace once ready and signed in', async () => {
    const { findByText } = view()
    expect(await findByText(zh['cert.empty'])).toBeTruthy()
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
    } as unknown as CertificateModalProps
    const second = {
      ...props,
      useRevision: (select: (value: number) => number) => select(1),
    } as unknown as CertificateModalProps
    const { rerender } = render(<CertificateModal {...first} />)
    expect(readClient).toHaveBeenCalledTimes(1)
    rerender(<CertificateModal {...second} />)
    expect(readClient).toHaveBeenCalledTimes(2)
  })
})
