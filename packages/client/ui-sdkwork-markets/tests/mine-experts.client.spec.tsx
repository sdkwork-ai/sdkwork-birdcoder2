// @vitest-environment jsdom
/**
 * My-experts page spec: the page renders its header (back control, title,
 * search field, create-expert trigger), the filter row (roster tabs with
 * their counts and the source scope), and the per-scope empty notice; the
 * back control fires the exit; the create trigger's menu opens on pointer
 * hover, holds across the leave grace, closes after it, and each expert type
 * dispatches its creation prompt; outside pointerdown and Escape close the
 * menu at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { MineExpertsPage, type MineExpertsPageProps } from '../src/client/MineExpertsPage.tsx'
import { CreateExpertMenu, type CreateExpertMenuProps } from '../src/client/CreateExpertMenu.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The dispatch double: records the composed prompts. */
const dispatchPrompt = vi.fn()
/** The back double: records the exits. */
const onBack = vi.fn()

beforeEach(() => {
  dispatchPrompt.mockClear()
  onBack.mockClear()
})

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as MineExpertsPageProps['t']

/** Render the my-experts page. */
function minePage() {
  return render(<MineExpertsPage t={t} dispatchPrompt={dispatchPrompt} onBack={onBack} />)
}

/** Render the create-expert affordance standalone. */
function createMenu(props: Partial<CreateExpertMenuProps> = {}) {
  return render(<CreateExpertMenu t={t} dispatchPrompt={dispatchPrompt} {...props} />)
}

/** Open the menu the way a pointer does (hover). */
function hoverOpen(view: ReturnType<typeof createMenu>): void {
  fireEvent.pointerOver(view.container.querySelector('[data-mine-experts-create]') as HTMLElement,
    { pointerType: 'mouse' })
}

describe('MineExpertsPage', () => {
  it('renders the header, the filter row, and the created-experts empty notice', () => {
    const view = minePage()
    expect(view.container.querySelector('[data-mine-experts]')).not.toBeNull()
    // Header: back control and title lead, search and the create trigger trail.
    expect(view.container.querySelector('[data-mine-experts-back]')!.getAttribute('aria-label'))
      .toBe('mine.experts.back')
    expect(view.getByText('mine.experts.title')).not.toBeNull()
    const search = view.getByRole('searchbox', { name: 'mine.experts.search' })
    expect(search.getAttribute('placeholder')).toBe('mine.experts.search')
    expect(view.getByRole('button', { name: 'mine.experts.create' }).getAttribute('aria-haspopup'))
      .toBe('menu')
    // Filter row: the roster tabs carry their counts; the scope reads created.
    const tabs = Array.from(view.getByRole('tablist', { name: 'mine.experts.tabs.label' })
      .querySelectorAll('[role="tab"]'))
    expect(tabs.map(tab => tab.textContent)).toEqual(['mine.experts.tab.experts0', 'mine.experts.tab.teams0'])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    const radios = Array.from(view.getByRole('radiogroup', { name: 'mine.experts.scope.label' })
      .querySelectorAll('[role="radio"]'))
    expect(radios.map(radio => radio.textContent))
      .toEqual(['mine.experts.scope.created', 'mine.experts.scope.purchased'])
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    // The experts roster is empty (no catalog store yet), so the panel renders
    // the created-scope empty notice.
    expect(view.container.querySelector('[data-mine-experts-panel]')!.getAttribute('data-mine-experts-panel'))
      .toBe('experts')
    expect(view.container.querySelector('[data-mine-experts-empty]')!.textContent)
      .toBe('mine.experts.empty.created')
  })

  it('switches the roster tab and reads its empty notice', () => {
    const view = minePage()
    fireEvent.click(view.container.querySelector('[data-mine-experts-tab="teams"]') as HTMLElement)
    expect(view.container.querySelector('[data-mine-experts-panel]')!.getAttribute('data-mine-experts-panel'))
      .toBe('teams')
    expect(view.container.querySelector('[data-mine-experts-tab="teams"]')!.getAttribute('aria-selected'))
      .toBe('true')
    expect(view.container.querySelector('[data-mine-experts-empty]')!.textContent)
      .toBe('mine.experts.empty.teams.created')
    // Back to experts restores its panel and notice.
    fireEvent.click(view.container.querySelector('[data-mine-experts-tab="experts"]') as HTMLElement)
    expect(view.container.querySelector('[data-mine-experts-empty]')!.textContent)
      .toBe('mine.experts.empty.created')
  })

  it('switches the source scope and reads its empty notice', () => {
    const view = minePage()
    fireEvent.click(view.container
      .querySelector('[data-mine-experts-scope-option="purchased"]') as HTMLElement)
    expect(view.container.querySelector('[data-mine-experts-panel]')!.getAttribute('data-mine-experts-scope'))
      .toBe('purchased')
    expect(view.container
      .querySelector('[data-mine-experts-scope-option="purchased"]')!.getAttribute('aria-checked'))
      .toBe('true')
    expect(view.container.querySelector('[data-mine-experts-empty]')!.textContent)
      .toBe('mine.experts.empty.purchased')
    // The teams tab's purchased notice is its own copy.
    fireEvent.click(view.container.querySelector('[data-mine-experts-tab="teams"]') as HTMLElement)
    expect(view.container.querySelector('[data-mine-experts-empty]')!.textContent)
      .toBe('mine.experts.empty.teams.purchased')
  })

  it('backs out through the back control', () => {
    const view = minePage()
    fireEvent.click(view.container.querySelector('[data-mine-experts-back]') as HTMLElement)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('accepts search input', () => {
    const view = minePage()
    const search = view.getByRole('searchbox', { name: 'mine.experts.search' }) as HTMLInputElement
    fireEvent.change(search, { target: { value: 'code-review' } })
    expect(search.value).toBe('code-review')
  })
})

describe('CreateExpertMenu', () => {
  it('opens on pointer hover and lists the three expert types', () => {
    const view = createMenu()
    expect(view.queryByRole('menu')).toBeNull()
    hoverOpen(view)
    const menu = view.getByRole('menu', { name: 'mine.experts.create' })
    expect(view.getByRole('button', { name: 'mine.experts.create' }).getAttribute('aria-expanded'))
      .toBe('true')
    expect(Array.from(menu.querySelectorAll('[role="menuitem"]')).map(item => item.textContent))
      .toEqual([
        'mine.experts.create.localmine.experts.create.local.desc',
        'mine.experts.create.remotemine.experts.create.remote.desc',
        'mine.experts.create.vmmine.experts.create.vm.desc',
      ])
  })

  it('ignores touch hover; the tap toggles through the click', () => {
    const view = createMenu()
    const wrap = view.container.querySelector('[data-mine-experts-create]') as HTMLElement
    fireEvent.pointerOver(wrap, { pointerType: 'touch' })
    expect(view.queryByRole('menu')).toBeNull()
    // The click still opens the menu, and a touch leave never arms the grace.
    fireEvent.click(view.getByRole('button', { name: 'mine.experts.create' }))
    expect(view.getByRole('menu')).not.toBeNull()
    fireEvent.pointerOut(wrap, { pointerType: 'touch' })
    expect(view.getByRole('menu')).not.toBeNull()
  })

  it('holds the menu across the leave grace and closes after it', () => {
    vi.useFakeTimers()
    const view = createMenu()
    hoverOpen(view)
    fireEvent.pointerOut(view.container.querySelector('[data-mine-experts-create]') as HTMLElement,
      { pointerType: 'mouse' })
    // Inside the grace the menu stays mounted.
    expect(view.getByRole('menu')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(150) })
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('cancels the pending close when the pointer returns within the grace', () => {
    vi.useFakeTimers()
    const view = createMenu()
    hoverOpen(view)
    const wrap = view.container.querySelector('[data-mine-experts-create]') as HTMLElement
    fireEvent.pointerOut(wrap, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(100) })
    fireEvent.pointerOver(wrap, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(100) })
    // 200ms have passed since the leave, but the re-enter reset the grace and
    // the pointer is back over the trigger, so the menu stays.
    expect(view.getByRole('menu')).not.toBeNull()
    // Leaving again arms a fresh grace, which closes the menu.
    fireEvent.pointerOut(wrap, { pointerType: 'mouse' })
    act(() => { vi.advanceTimersByTime(150) })
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('toggles through the trigger click and closes on selection with a dispatch', () => {
    const view = createMenu()
    const trigger = view.getByRole('button', { name: 'mine.experts.create' })
    fireEvent.click(trigger)
    expect(view.getByRole('menu')).not.toBeNull()
    fireEvent.click(trigger)
    expect(view.queryByRole('menu')).toBeNull()

    hoverOpen(view)
    fireEvent.click(view.getByRole('menuitem', { name: 'mine.experts.create.local' }))
    expect(dispatchPrompt).toHaveBeenCalledTimes(1)
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.experts.create.local')
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('dispatches the remote and personal-VM prompts from their menu items', () => {
    const view = createMenu()
    hoverOpen(view)
    fireEvent.click(view.getByRole('menuitem', { name: 'mine.experts.create.remote' }))
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.experts.create.remote')
    hoverOpen(view)
    fireEvent.click(view.getByRole('menuitem', { name: 'mine.experts.create.vm' }))
    expect(dispatchPrompt).toHaveBeenCalledWith('prompt.experts.create.vm')
    expect(dispatchPrompt).toHaveBeenCalledTimes(2)
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape and on outside pointerdown, and holds on inside events', () => {
    const view = createMenu()
    hoverOpen(view)
    // A key that is not Escape never closes the menu.
    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(view.getByRole('menu')).not.toBeNull()
    // A pointerdown inside the trigger+menu root never closes it either; the
    // trigger's own click toggle owns that interaction.
    fireEvent.pointerDown(view.getByRole('menuitem', { name: 'mine.experts.create.local' }))
    expect(view.getByRole('menu')).not.toBeNull()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(view.queryByRole('menu')).toBeNull()

    hoverOpen(view)
    fireEvent.pointerDown(document.body)
    expect(view.queryByRole('menu')).toBeNull()
    expect(dispatchPrompt).not.toHaveBeenCalled()
  })

  it('clears the armed grace timer on unmount', () => {
    vi.useFakeTimers()
    const view = createMenu()
    hoverOpen(view)
    fireEvent.pointerOut(view.container.querySelector('[data-mine-experts-create]') as HTMLElement,
      { pointerType: 'mouse' })
    view.unmount()
    act(() => { vi.advanceTimersByTime(300) })
    expect(dispatchPrompt).not.toHaveBeenCalled()
  })
})
