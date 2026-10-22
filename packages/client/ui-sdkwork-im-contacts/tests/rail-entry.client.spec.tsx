// @vitest-environment jsdom
/**
 * Contacts rail entry spec: the 44px cell renders the outline glyph while idle,
 * swaps to the filled glyph with the selection chrome while active, and
 * switches the frame mode on click.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { ContactsRailEntry, type ContactsRailEntryProps } from '../src/client/RailEntry.tsx'

const t = ((key: string) => key) as ContactsRailEntryProps['t']

/** The entry reads the standard kit it never touches; the props cast keeps the fixture small. */
function entryProps(active: boolean, setMode: ContactsRailEntryProps['setMode'] = () => {}): ContactsRailEntryProps {
  return { mode: 'contacts', active, setMode, t } as unknown as ContactsRailEntryProps
}

describe('ContactsRailEntry', () => {
  it('renders the outline glyph and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(<ContactsRailEntry {...entryProps(false, setMode)} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.contacts.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.querySelector('[stroke]')).not.toBeNull()
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('contacts')
  })

  it('renders the filled glyph with the selection chrome while active', () => {
    const { container } = render(<ContactsRailEntry {...entryProps(true)} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('[stroke]')).toBeNull()
    expect(button.className).toContain('active')
  })
})
