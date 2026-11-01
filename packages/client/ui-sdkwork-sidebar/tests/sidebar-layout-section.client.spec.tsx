// @vitest-environment jsdom
/**
 * Sidebar settings page spec: the page stacks the published layout into its
 * three groups, mirrors each row's switch state, forwards every switch write
 * through the injected face instead of writing the preference itself, and
 * offers the reset affordance only while something is hidden.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SidebarLayoutSection, type SidebarLayoutSectionProps } from '../src/client/SidebarLayoutSection.tsx'
import type { SidebarItem, SidebarLayoutSnapshot } from '../src/client/layout.ts'
import { en } from '../src/client/layout-locales.ts'

afterEach(cleanup)

/** Locale seat stand-in: the real English dictionary, so assertions read copy. */
const t = makeTranslate({ ...en }) as SidebarLayoutSectionProps['t']

function item(id: string, group: SidebarItem['group'], title: string): SidebarItem {
  return { id, group, title, order: 0 }
}

/** Build the props the renderer would compose; only the shares this page reads are filled. */
function mount(layout: SidebarLayoutSnapshot) {
  const setVisible = vi.fn()
  const reset = vi.fn()
  const props = {
    // The shell-owned section affordance (SettingsSectionOwnerProps.close).
    close: vi.fn(),
    // The published layout arrives as the registrant's hook source; the page
    // never sees the store itself.
    useLayout: (selector: (snapshot: SidebarLayoutSnapshot) => unknown) => selector(layout),
    setVisible,
    reset,
    t,
  }
  render(<SidebarLayoutSection {...(props as SidebarLayoutSectionProps)} />)
  return { setVisible, reset }
}

describe('SidebarLayoutSection', () => {
  it('stacks the visible groups in column order with one row per entry', () => {
    mount({
      items: [
        item('new-chat', 'actions', 'New chat'),
        item('market', 'actions', 'Market'),
        item('demand-hall', 'pages', 'Demand Hall'),
      ],
      hidden: [],
    })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(en.title)
    expect(screen.getByText(en.intro)).toBeTruthy()
    const groups = screen.getAllByRole('region')
    expect(groups.map(group => group.getAttribute('aria-label'))).toEqual([en['group.actions'], en['group.pages']])
    expect(within(groups[0]).getAllByRole('switch').map(row => row.getAttribute('aria-checked')))
      .toEqual(['true', 'true'])
    expect(within(groups[1]).getAllByRole('switch')).toHaveLength(1)
    // A panel group with no contributions renders no empty region.
    expect(screen.queryByRole('region', { name: en['group.panels'] })).toBeNull()
  })

  it('mirrors the hidden set into the switch state', () => {
    mount({
      items: [item('new-chat', 'actions', 'New chat'), item('market', 'actions', 'Market')],
      hidden: ['market'],
    })
    const switches = screen.getAllByRole('switch')
    expect(switches.map(row => row.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(switches[1].getAttribute('aria-label')).toBe('Show Market in the sidebar')
  })

  it('forwards each switch write through the injected face', () => {
    const { setVisible } = mount({ items: [item('market', 'actions', 'Market')], hidden: [] })
    fireEvent.click(screen.getByRole('switch'))
    expect(setVisible).toHaveBeenCalledExactlyOnceWith('market', false)
  })

  it('offers reset only while something is hidden, and forwards it', () => {
    mount({ items: [item('market', 'actions', 'Market')], hidden: [] })
    expect(screen.queryByRole('button', { name: en.reset })).toBeNull()

    cleanup()
    const hiddenView = mount({ items: [item('market', 'actions', 'Market')], hidden: ['market'] })
    fireEvent.click(screen.getByRole('button', { name: en.reset }))
    expect(hiddenView.reset).toHaveBeenCalledOnce()
  })

  it('states the empty composition instead of an empty list', () => {
    mount({ items: [], hidden: [] })
    expect(screen.getByText(en.empty)).toBeTruthy()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
