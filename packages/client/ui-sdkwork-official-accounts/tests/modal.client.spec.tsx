// @vitest-environment jsdom
/**
 * The official-account dialog: the three states it decides (unconfigured,
 * signed out, ready) and its dismissal paths. The embedded IAM panel is
 * stubbed — the dialog's job is the frame, not the capability.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficialAccountsModal, toOfficialAccountsLocale, type OfficialAccountsModalProps } from '../src/client/OfficialAccountsModal.tsx'
import {
  OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE,
  OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE,
} from '../src/client/embedScope.ts'

vi.mock('@sdkwork/ui-pc-react', () => ({
  SdkworkThemeProvider: ({ children }: { children: ReactNode }) => (
    <div data-sdkwork-theme-provider="">{children}</div>
  ),
}))

vi.mock('@sdkwork/i18n-pc-react', () => ({
  SdkworkI18nProvider: ({ children }: { children: ReactNode }) => (
    <div data-sdkwork-i18n-provider="">{children}</div>
  ),
}))

vi.mock('@sdkwork/iam-pc-oauth', () => ({
  SDKWORK_IAM_OFFICIAL_ACCOUNTS_I18N_CATALOG: { namespace: 'iam.oauth.officialAccounts' },
  SdkworkIamOfficialAccountsPanel: () => <div data-official-accounts-panel="" />,
}))

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as OfficialAccountsModalProps['t']

/** Host double: the dialog reads only the controller seam from the adapter. */
const host: OfficialAccountsModalProps['host'] = {
  readController: () => ({}) as ReturnType<OfficialAccountsModalProps['host']['readController']>,
}

interface State {
  open?: boolean
  available?: boolean
  signedIn?: boolean
  language?: string
  colorScheme?: 'light' | 'dark'
}

/** Render the dialog with one explicit host state. */
function view(state: State = {}, props: Partial<OfficialAccountsModalProps> = {}) {
  return render(
    <OfficialAccountsModal
      open={state.open ?? true}
      onClose={() => {}}
      host={host}
      startSignIn={() => {}}
      useAvailable={select => select(state.available ?? true)}
      useSignedIn={select => select(state.signedIn ?? true)}
      useLanguage={select => select(state.language ?? 'zh')}
      useColorScheme={select => select(state.colorScheme ?? 'dark')}
      t={t}
      {...props}
    />,
  )
}

afterEach(() => {
  cleanup()
  document.body.removeAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE)
})

describe('OfficialAccountsModal', () => {
  it('renders nothing while closed', () => {
    const { container } = view({ open: false })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.hasAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE)).toBe(false)
  })

  it('marks the dialog root and the body so the scoped sheet reaches the page overlays', () => {
    const { container } = view()
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute(OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE)).toBe('ready')
    expect(document.body.hasAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE)).toBe(true)
    cleanup()
    expect(document.body.hasAttribute(OFFICIAL_ACCOUNTS_EMBED_PORTAL_ATTRIBUTE)).toBe(false)
  })

  it('reports an unconfigured gateway on the root marker', () => {
    const { container } = view({ available: false })
    expect(container.querySelector('[role="dialog"]')?.getAttribute(OFFICIAL_ACCOUNTS_EMBED_ATTRIBUTE))
      .toBe('unconfigured')
  })

  it('explains an unconfigured gateway instead of mounting the panel', () => {
    const { container, queryByText } = view({ available: false })
    expect(queryByText('section.notConfigured')).not.toBeNull()
    expect(container.querySelector('[data-official-accounts-panel]')).toBeNull()
  })

  it('offers sign-in while signed out and raises the shared surface', () => {
    const startSignIn = vi.fn()
    const { container, getByText } = view({ signedIn: false }, { startSignIn })
    expect(getByText('section.signInRequired')).toBeTruthy()
    expect(container.querySelector('[data-official-accounts-panel]')).toBeNull()
    fireEvent.click(getByText('section.signIn'))
    expect(startSignIn).toHaveBeenCalledTimes(1)
  })

  it('mounts the user-facing IAM panel once signed in', () => {
    const { container } = view({ language: 'zh' })
    expect(container.querySelector('[data-sdkwork-theme-provider]')).not.toBeNull()
    expect(container.querySelector('[data-sdkwork-i18n-provider]')).not.toBeNull()
    expect(container.querySelector('[data-official-accounts-panel]')).not.toBeNull()
  })

  it('closes on Escape and on a mask click', () => {
    const onClose = vi.fn()
    const { container } = view({}, { onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    const mask = container.querySelector('[aria-hidden="true"]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask as Element)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('maps the harness locale onto the SDKWork catalog tag', () => {
    expect(toOfficialAccountsLocale('zh')).toBe('zh-CN')
    expect(toOfficialAccountsLocale('en')).toBe('en-US')
  })
})
