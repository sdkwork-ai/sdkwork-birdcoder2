// @vitest-environment jsdom
/** The rail shortcut: cell glyph and label, the hover card, and the dialog its click opens. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { GlobalStandardProps, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { MobileConnectEntry, type MobileConnectEntryProps } from '../src/client/MobileConnectEntry.tsx'
import { en } from '../src/client/locales.ts'
import type { MobileConnectSettings } from '../src/settings.ts'

afterEach(cleanup)

/** Translate seat over the plugin's own dictionary. */
const t = makeTranslate(en) as MobileConnectEntryProps['t']

/** One accepted settings section. */
const SECTION: ConfigFormSnapshot<MobileConnectSettings> = {
  status: 'ready',
  value: {
    remoteAccessEnabled: true,
    appDownloadUrl: 'https://sdkwork.test/app',
    miniProgramUrl: 'https://sdkwork.test/mp',
  },
  base: undefined,
  user: undefined,
  revision: 1,
  writable: true,
}

/** One observable settings section. */
function source(section: ConfigFormSnapshot<MobileConnectSettings> = SECTION): HostObservable<ConfigFormSnapshot<MobileConnectSettings>> {
  return { getSnapshot: () => section, subscribe: () => () => {} }
}

/** Compose the shortcut's slot props over one settings section. */
function entryProps(setRemoteAccess = vi.fn(async () => true), section = SECTION) {
  const props = {
    ...({} as GlobalStandardProps),
    activeMode: 'code' as const,
    useConfig: bindSnapshotSelector(source(section)),
    setRemoteAccess,
    t,
  } as MobileConnectEntryProps
  return { props, setRemoteAccess }
}

describe('MobileConnectEntry', () => {
  it('labels the cell and announces that it opens a dialog', () => {
    const { props } = entryProps()
    const { container } = render(<MobileConnectEntry {...props} />)
    const cell = screen.getByRole('button', { name: en['rail.aria'] })
    expect(cell.getAttribute('aria-haspopup')).toBe('dialog')
    expect(container.querySelector('[data-icon*="remote-connection-outline"]')).not.toBeNull()
  })

  it('shows the scan card while the pointer rests on the cell', async () => {
    const { props } = entryProps()
    render(<MobileConnectEntry {...props} />)
    fireEvent.pointerOver(screen.getByRole('button', { name: en['rail.aria'] }))
    expect(await screen.findByText(en['title.app'])).toBeTruthy()
    expect(screen.getByRole('switch', { name: en['remote'] })).toBeTruthy()
  })

  it('opens the same card as a dialog on activation', async () => {
    const { props, setRemoteAccess } = entryProps()
    render(<MobileConnectEntry {...props} />)
    fireEvent.click(screen.getByRole('button', { name: en['rail.aria'] }))
    const dialog = await screen.findByRole('dialog', { name: en['dialog.title'] })
    fireEvent.click(screen.getByRole('switch', { name: en['remote'] }))
    await waitFor(() => { expect(setRemoteAccess).toHaveBeenCalledExactlyOnceWith(false) })
    expect(dialog).toBeTruthy()
  })

  it('says nothing about the scan destinations until the section resolves', async () => {
    const loading: ConfigFormSnapshot<MobileConnectSettings> = { ...SECTION, status: 'loading', value: undefined }
    const { props } = entryProps(vi.fn(async () => true), loading)
    render(<MobileConnectEntry {...props} />)
    fireEvent.click(screen.getByRole('button', { name: en['rail.aria'] }))
    const dialog = await screen.findByRole('dialog', { name: en['dialog.title'] })
    expect(within(dialog).getByRole('status', { name: en['qr.loading'] })).toBeTruthy()
    expect(within(dialog).queryByRole('img')).toBeNull()
  })
})
