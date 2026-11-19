// @vitest-environment jsdom
/**
 * Presentation coverage for the Input history settings page: the copy, the
 * immediate preference controls, the staged (clamped) retention field, and the
 * cached-entry count/clear affordance.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { InputHistorySection } from '../src/client/InputHistorySection.tsx'
import type { InputHistorySectionProps } from '../src/client/InputHistorySection.tsx'
import type { InputHistoryState } from '../src/client/input-history-store.ts'
import { en } from '../src/client/locales.ts'
import type { InputHistoryKey } from '../src/client/locales.ts'

/** Translate through the English dictionary, interpolating `{count}`-style parameters. */
function translate(key: InputHistoryKey, params?: Readonly<Record<string, string | number>>): string {
  return en[key].replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? ''))
}

/** Render the page over one ledger snapshot and return its write spies. */
function renderSection(state: InputHistoryState) {
  const store = createSnapshotStore(state)
  const writes = {
    setEnabled: vi.fn(),
    setScope: vi.fn(),
    setRetentionDays: vi.fn(),
    clear: vi.fn(),
  }
  const props = {
    t: translate,
    useHistory: <Selected,>(selector: (value: InputHistoryState) => Selected): Selected => selector(store.getSnapshot()),
    ...writes,
  } as unknown as InputHistorySectionProps
  return { ...render(<InputHistorySection {...props} />), writes }
}

/** A ledger with two cached entries and the shipped preferences. */
function populated(): InputHistoryState {
  return {
    settings: { enabled: true, scope: 'session', retentionDays: 30 },
    entries: [
      { id: 'a', text: 'alpha', sessionId: 's1' as never, projectKey: 'p1', submittedAt: 2 },
      { id: 'b', text: 'beta', sessionId: 's1' as never, projectKey: 'p1', submittedAt: 1 },
    ],
  }
}

describe('Input history settings page', () => {
  afterEach(() => { cleanup() })

  it('renders the shipped preferences and the cached count', () => {
    renderSection(populated())

    expect(screen.getByRole('heading', { name: 'Input history' })).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Enable input history' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('tab', { name: 'This session' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Browse only messages sent in this session.')).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Retention in days' })).toHaveProperty('value', '30')
    expect(screen.getByText('2 entries cached.')).toBeTruthy()
  })

  it('commits toggle, scope, and clear immediately', () => {
    const { writes } = renderSection(populated())

    screen.getByRole('switch', { name: 'Enable input history' }).click()
    expect(writes.setEnabled).toHaveBeenCalledWith(false)

    screen.getByRole('tab', { name: 'All projects' }).click()
    expect(writes.setScope).toHaveBeenCalledWith('global')

    screen.getByRole('button', { name: 'Clear history' }).click()
    expect(writes.clear).toHaveBeenCalledOnce()
  })

  it('stages the retention number and commits the clamped value on blur', () => {
    const { writes } = renderSection(populated())
    const input = screen.getByRole('spinbutton', { name: 'Retention in days' }) as HTMLInputElement

    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.blur(input)
    expect(writes.setRetentionDays).toHaveBeenCalledWith(7)

    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)
    expect(writes.setRetentionDays).toHaveBeenLastCalledWith(1)
    expect(input.value).toBe('1')
  })

  it('commits the retention number on Enter', () => {
    const { writes } = renderSection(populated())
    const input = screen.getByRole('spinbutton', { name: 'Retention in days' })

    fireEvent.change(input, { target: { value: '400' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(writes.setRetentionDays).toHaveBeenCalledWith(365)
  })

  it('disables the destructive clear when nothing is cached', () => {
    renderSection({ settings: { enabled: false, scope: 'global', retentionDays: 30 }, entries: [] })

    expect(screen.getByRole('button', { name: 'Clear history' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Input history is turned off.')).toBeTruthy()
    expect(screen.getByRole('spinbutton', { name: 'Retention in days' })).toHaveProperty('disabled', true)
  })
})
