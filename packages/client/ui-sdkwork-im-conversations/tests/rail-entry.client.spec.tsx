// @vitest-environment jsdom
/**
 * Chat rail entry spec: the 44px cell renders the outline glyph while idle,
 * swaps to the filled glyph while active, badges the inbox unread total, and
 * switches the frame mode on click.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { ImSnapshot } from '@deepseek-ai/dsh-client-ui-sdkwork-im/client'
import { ChatRailEntry, type ChatRailEntryProps } from '../src/client/RailEntry.tsx'

const t = ((key: string) => key) as ChatRailEntryProps['t']

function props(
  unread: number,
  overrides: Partial<ChatRailEntryProps> = {},
): ChatRailEntryProps {
  return {
    mode: 'chat',
    active: false,
    setMode: vi.fn(),
    useIm: (((selector: (s: ImSnapshot) => unknown) => selector({ selectedConversationId: null, totalUnread: unread, error: null } as ImSnapshot)) as unknown) as ChatRailEntryProps['useIm'],
    t,
    ...overrides,
  } as unknown as ChatRailEntryProps
}

describe('ChatRailEntry', () => {
  it('renders the outline glyph and switches the frame mode on click', () => {
    const setMode = vi.fn()
    const { container } = render(<ChatRailEntry {...props(0, { setMode })} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('mode.chat.label')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.querySelector('[stroke]')).not.toBeNull()
    expect(button.className).not.toContain('active')
    fireEvent.click(button)
    expect(setMode).toHaveBeenCalledWith('chat')
  })

  it('renders the filled glyph with the selection chrome while active', () => {
    const { container } = render(<ChatRailEntry {...props(0, { active: true })} />)
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.querySelector('[stroke]')).toBeNull()
    expect(button.className).toContain('active')
  })

  it('badges the inbox unread total and caps it at 99+', () => {
    const { container, rerender } = render(<ChatRailEntry {...props(3)} />)
    expect(container.querySelector('span')?.textContent).toBe('3')
    rerender(<ChatRailEntry {...props(120)} />)
    expect(container.querySelector('span')?.textContent).toBe('99+')
  })

  it('renders no badge when the snapshot has no unread total', () => {
    const { container } = render(
      <ChatRailEntry
        {...props(0)}
        useIm={(((selector: (snapshot: Record<string, never>) => unknown) => selector({})) as unknown) as ChatRailEntryProps['useIm']}
      />,
    )
    expect(container.querySelector('span')).toBeNull()
  })

  it('renders no badge when the inbox is read', () => {
    const { container } = render(<ChatRailEntry {...props(0)} />)
    expect(container.querySelector('span')).toBeNull()
  })
})
