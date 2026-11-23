// @vitest-environment jsdom
/** The account top-up gesture the Chat quota failure row keeps in view. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { GlobalStandardProps, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import type { AccountSnapshot } from '../src/client/AccountSection.tsx'
import type {} from '../src/client/index.ts'
import { QuotaTopUpAction } from '../src/client/QuotaTopUpAction.tsx'
import { createPlatformPages, type PlatformPages } from '../src/client/platform-pages.ts'

const TOP_UP_URL = 'https://platform.birdcoder.com/top_up'
// The entry reads no framework hook besides the injected account face.
const standard = { ...({} as GlobalStandardProps & SessionStandardProps) }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** The account's Host-projected view, absent before its first snapshot. */
function snapshot(status?: 'signed-out' | 'credential-stored', topUpUrl = TOP_UP_URL): AccountSnapshot {
  const view: AccountView = {
    status: status ?? 'signed-out', attempt: null, links: { usageUrl: '', topUpUrl },
  }
  return { view: status === undefined ? undefined : view, details: undefined, avatar: undefined, failed: false }
}

/** Mount the entry the way the Chat row does: failure code, label, and the live account fact. */
function mount(options: {
  code?: string
  label?: string
  account?: AccountSnapshot
  pages?: PlatformPages
} = {}) {
  let account = options.account ?? snapshot('credential-stored')
  const label = options.label ?? 'Top up'
  let rerender = () => {}
  const element = () => (
    <QuotaTopUpAction
      {...standard}
      code={options.code ?? 'ACCOUNT_QUOTA'}
      label={label}
      useAccount={selector => selector(account)}
      {...options.pages === undefined ? {} : { openPlatformPage: options.pages.open }}
    />
  )
  const rendered = render(element())
  rerender = () => { rendered.rerender(element()) }
  return {
    rendered,
    label,
    setAccount: (next: AccountSnapshot) => { account = next; rerender() },
  }
}

it('links a signed-in browser to the account top-up page in a new tab', () => {
  mount({ code: 'QUOTA' })
  const link = screen.getByRole('link', { name: 'Top up' })
  expect(link.getAttribute('href')).toBe(TOP_UP_URL)
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noreferrer')
})

it('requests the shared native top-up page on Desktop instead of navigating', () => {
  const pages = createPlatformPages()
  const open = vi.spyOn(pages, 'open')
  // The embedded page carries its own sign-in, so a sign-out leaves the durable
  // row's gesture available.
  mount({ pages, account: snapshot('signed-out') })
  const action = screen.getByRole('button', { name: 'Top up' })
  expect(screen.queryByRole('link')).toBeNull()
  fireEvent.click(action)
  expect(open).toHaveBeenCalledWith('top-up', expect.any(Function))
  expect(pages.getSnapshot()).toEqual({ page: 'top-up' })
})

it('serves both quota codes and declines every other failure', () => {
  for (const code of ['QUOTA', 'ACCOUNT_QUOTA']) {
    const mounted = mount({ code })
    expect(screen.getByRole('link', { name: 'Top up' })).toBeTruthy()
    mounted.rendered.unmount()
  }
  for (const code of ['AUTH', 'MISSING_CREDENTIAL', 'ACCOUNT_SIGN_OUT']) {
    const mounted = mount({ code })
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    mounted.rendered.unmount()
  }
})

it('withholds the browser link while no account credential is stored', () => {
  const mounted = mount({ account: snapshot('signed-out') })
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  // The first snapshot can arrive after the row mounted; the seat follows it.
  mounted.setAccount(snapshot('credential-stored'))
  expect(screen.getByRole('link', { name: 'Top up' })).toBeTruthy()
})

it('renders nothing while the account state is still unloaded', () => {
  const mounted = mount({ account: snapshot() })
  expect(screen.queryByRole('link')).toBeNull()
  mounted.setAccount(snapshot('signed-out'))
  expect(screen.queryByRole('link')).toBeNull()
})

it('renders nothing when the account links carry no top-up destination', () => {
  mount({ account: snapshot('credential-stored', '') })
  expect(screen.queryByRole('link')).toBeNull()
})
