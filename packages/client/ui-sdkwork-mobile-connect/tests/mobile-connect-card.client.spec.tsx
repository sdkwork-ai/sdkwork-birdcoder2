// @vitest-environment jsdom
/** The scan card: destinations, QR states, and the remote-connection switch. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { MobileConnectCard, type MobileConnectCardProps } from '../src/client/MobileConnectCard.tsx'
import { en } from '../src/client/locales.ts'
import type { MobileConnectSettings } from '../src/settings.ts'

afterEach(cleanup)

/** Translate seat over the plugin's own dictionary. */
const t = makeTranslate(en) as MobileConnectCardProps['t']

/** One accepted settings section. */
function snapshot(overrides: Partial<MobileConnectSettings> = {}, status: ConfigFormSnapshot<MobileConnectSettings>['status'] = 'ready'): ConfigFormSnapshot<MobileConnectSettings> {
  return {
    status,
    value: status === 'ready'
      ? {
        remoteAccessEnabled: true,
        appDownloadUrl: 'https://sdkwork.test/app',
        miniProgramUrl: 'https://sdkwork.test/mp',
        ...overrides,
      }
      : undefined,
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
  }
}

/** Compose the card's props. */
function cardProps(
  section: ConfigFormSnapshot<MobileConnectSettings> = snapshot(),
  setRemoteAccess: MobileConnectCardProps['setRemoteAccess'] = async () => true,
  variant: MobileConnectCardProps['variant'] = 'compact',
): MobileConnectCardProps {
  return { snapshot: section, setRemoteAccess, variant, t }
}

describe('MobileConnectCard', () => {
  it('shows the App destination and both destinations as tabs', () => {
    render(<MobileConnectCard {...cardProps()} />)
    const tabs = screen.getByRole('tablist', { name: en['tabs.label'] })
    expect(within(tabs).getAllByRole('tab').map(tab => tab.textContent))
      .toEqual([en['tab.app'], en['tab.miniProgram']])
    expect(screen.getByText(en['title.app'])).toBeTruthy()
    expect(screen.getByRole('img', { name: en['qr.app'] }).getAttribute('class')).toBeTruthy()
  })

  it('switches the destination, its title, and the encoded page', () => {
    const { container } = render(<MobileConnectCard {...cardProps()} />)
    const before = container.querySelector('svg')?.outerHTML
    fireEvent.click(screen.getByRole('tab', { name: en['tab.miniProgram'] }))
    expect(screen.getByText(en['title.miniProgram'])).toBeTruthy()
    expect(screen.getByRole('img', { name: en['qr.miniProgram'] })).toBeTruthy()
    expect(container.querySelector('svg')?.outerHTML).not.toBe(before)
  })

  it('writes the asked-for switch state and mirrors the stored one', async () => {
    const setRemoteAccess = vi.fn(async () => true)
    const { rerender } = render(<MobileConnectCard {...cardProps(snapshot(), setRemoteAccess)} />)
    const toggle = screen.getByRole('switch', { name: en['remote'] })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    await waitFor(() => { expect(setRemoteAccess).toHaveBeenCalledExactlyOnceWith(false) })
    rerender(<MobileConnectCard {...cardProps(snapshot({ remoteAccessEnabled: false }), setRemoteAccess)} />)
    expect(screen.getByRole('switch', { name: en['remote'] }).getAttribute('aria-checked')).toBe('false')
  })

  it('reports a refused write beside the switch', async () => {
    const setRemoteAccess = vi.fn(async () => false)
    render(<MobileConnectCard {...cardProps(snapshot(), setRemoteAccess)} />)
    fireEvent.click(screen.getByRole('switch', { name: en['remote'] }))
    await waitFor(() => { expect(screen.getByText(en['remote.failed'])).toBeTruthy() })
  })

  it('disables the switch while the section is read-only', () => {
    render(<MobileConnectCard {...cardProps({ ...snapshot(), writable: false })} />)
    const toggle = screen.getByRole('switch', { name: en['remote'] })
    expect(toggle.disabled).toBe(true)
    expect(toggle.getAttribute('title')).toBe(en['remote.readOnly'])
  })

  it('shows a bare loading state before the section resolves', () => {
    render(<MobileConnectCard {...cardProps(snapshot({}, 'loading'))} />)
    expect(screen.getByRole('status', { name: en['qr.loading'] })).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('switch', { name: en['remote'] }).disabled).toBe(true)
  })

  it('explains an unconfigured destination instead of drawing a code', () => {
    render(<MobileConnectCard {...cardProps(snapshot({ appDownloadUrl: '  ' }))} />)
    expect(screen.getByText(en['qr.unconfigured'])).toBeTruthy()
    expect(screen.getByText(en['qr.unconfiguredHint'])).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('keeps the dialog variant as its own card surface', () => {
    const { container } = render(<MobileConnectCard {...cardProps(snapshot(), async () => true, 'dialog')} />)
    const card = container.firstElementChild
    expect(card?.className).toContain('dialog')
    expect(card?.className).not.toContain('compact')
  })
})
