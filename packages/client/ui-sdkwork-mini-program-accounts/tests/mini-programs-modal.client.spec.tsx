// @vitest-environment jsdom
/**
 * The mini-program modal frame: the three states it decides (unconfigured,
 * signed out, ready), its dismissal paths, and the environment-revision
 * re-read. The panel behaviour is covered by
 * `mini-programs-workspace.client.spec.tsx`.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMiniProgramController } from '@sdkwork/iam-pc-mini-program'
import { MiniProgramsModal, type MiniProgramsModalProps } from '../src/client/MiniProgramsModal.tsx'
import { zh, type MiniProgramKey } from '../src/client/locales.ts'

// The workspace bridge (and the shared panel under it) is covered by
// `mini-programs-workspace.client.spec.tsx` and the shared package's suite; the
// frame test only needs to know the workspace mounted.
vi.mock('../src/client/MiniProgramsWorkspace.tsx', () => ({
  MiniProgramsWorkspace: () => <div data-testid="workspace" />,
}))

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: MiniProgramKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as MiniProgramsModalProps['t']

/** A controller over an empty ledger, enough for the frame test. */
function emptyController() {
  return createMiniProgramController({
    list: async () => ({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
    create: async () => { throw new Error('unused') },
    update: async () => { throw new Error('unused') },
    delete: async () => undefined,
    setEnabled: async () => undefined,
  })
}

interface State {
  open?: boolean
  available?: boolean
  signedIn?: boolean
  language?: string
  colorScheme?: 'light' | 'dark'
  revision?: number
}

function view(state: State = {}, props: Partial<MiniProgramsModalProps> = {}) {
  const readController = vi.fn(() => emptyController())
  const composed = {
    open: state.open ?? true,
    onClose: () => {},
    host: {
      readReady: () => state.available ?? true,
      readController,
      readRevision: () => state.revision ?? 0,
    },
    startSignIn: () => {},
    useAvailable: (select: (value: boolean) => boolean) => select(state.available ?? true),
    useSignedIn: (select: (value: boolean) => boolean) => select(state.signedIn ?? true),
    useLanguage: (select: (value: string) => string) => select(state.language ?? 'zh'),
    useColorScheme: (select: (value: 'light' | 'dark') => 'light' | 'dark') => select(state.colorScheme ?? 'dark'),
    useRevision: (select: (value: number) => number) => select(state.revision ?? 0),
    t,
    ...props,
  } as MiniProgramsModalProps
  return render(<MiniProgramsModal {...composed} />)
}

describe('MiniProgramsModal', () => {
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
    expect(document.querySelector('[data-testid="workspace"]')).toBeNull()
  })

  it('falls back to the configuration notice when readiness races the controller read', () => {
    const { getByText } = view({ available: true }, {
      host: { readReady: () => true, readController: () => undefined, readRevision: () => 0 },
    })
    expect(getByText(zh['section.notConfigured'])).toBeTruthy()
  })

  it('mounts the shared panel workspace once ready and signed in', async () => {
    const { findByTestId } = view()
    expect(await findByTestId('workspace')).toBeTruthy()
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

  it('re-reads the controller when the environment revision moves', () => {
    const readController = vi.fn(() => emptyController())
    const host = { readReady: () => true, readController, readRevision: () => 0 }
    const props = {
      open: true,
      onClose: () => {},
      host,
      startSignIn: () => {},
      useAvailable: (select: (value: boolean) => boolean) => select(true),
      useSignedIn: (select: (value: boolean) => boolean) => select(true),
      useLanguage: (select: (value: string) => string) => select('zh'),
      useColorScheme: (select: (value: 'light' | 'dark') => 'light' | 'dark') => select('dark'),
      t,
    }
    const first = {
      ...props,
      useRevision: (select: (value: number) => number) => select(0),
    } as unknown as MiniProgramsModalProps
    const second = {
      ...props,
      useRevision: (select: (value: number) => number) => select(1),
    } as unknown as MiniProgramsModalProps
    const { rerender } = render(<MiniProgramsModal {...first} />)
    expect(readController).toHaveBeenCalledTimes(1)
    rerender(<MiniProgramsModal {...second} />)
    expect(readController).toHaveBeenCalledTimes(2)
  })
})
