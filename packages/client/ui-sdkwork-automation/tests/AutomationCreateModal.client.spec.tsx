// @vitest-environment jsdom
/**
 * Add-task dialog spec: the draft the dialog collects and hands to the page.
 * It renders nothing while closed, opens from a catalog template's seed or from
 * nothing at all, resets its draft on every open, asks for exactly the values
 * the chosen frequency needs, keeps confirm disabled until the draft can name a
 * task and its first run, and submits the whole draft once.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { AutomationCreateModal, type AutomationCreateModalProps } from '../src/client/AutomationCreateModal.tsx'
import type { CreateWorkspaceOption } from '../src/client/create-request.ts'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

afterEach(() => { cleanup() })

/** Locale seat stand-in: keys render verbatim so assertions read the contract. */
const t = ((key: string) => key) as AutomationCreateModalProps['t']

/** Two Workspaces the picker offers, one of them named only by its path. */
const WORKSPACES: readonly CreateWorkspaceOption[] = [
  { id: 'ws-alpha' as WorkspaceView['workspaceId'], label: 'Alpha' },
  { id: 'ws-beta' as WorkspaceView['workspaceId'], label: '/work/beta' },
]

function dialog(over: Partial<AutomationCreateModalProps> = {}) {
  const onClose = vi.fn()
  const onConfirm = vi.fn()
  const view = render(
    <AutomationCreateModal open workspaces={WORKSPACES} onClose={onClose} onConfirm={onConfirm} t={t} {...over} />,
  )
  return { view, onClose, onConfirm }
}

/** Type a name and an instruction, the two fields every case needs. */
function named(built = dialog()) {
  fireEvent.change(built.view.getByLabelText('create.nameLabel'), { target: { value: 'Morning briefing' } })
  fireEvent.change(built.view.getByLabelText('create.promptLabel'), { target: { value: 'Summarize the day' } })
  return built
}

/** Fill the fields the default (one-shot) frequency needs and return the view. */
function filled() {
  const built = named()
  fireEvent.change(built.view.getByLabelText('create.frequencyDate'), { target: { value: '2026-10-05T07:08' } })
  return built
}

/** The confirm control of a rendered dialog. */
const confirmOf = (view: { getByRole: (role: 'button', options: { name: string }) => HTMLElement }): HTMLButtonElement =>
  view.getByRole('button', { name: 'create.confirm' }) as HTMLButtonElement

describe('AutomationCreateModal', () => {
  it('renders nothing while closed', () => {
    const view = render(
      <AutomationCreateModal open={false} workspaces={WORKSPACES} onClose={vi.fn()} onConfirm={vi.fn()} t={t} />,
    )
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders the dialog chrome, the form rows, the workspace picker, and the push channels', () => {
    const { view } = dialog()
    const modal = view.getByRole('dialog', { name: 'create.title' })
    expect(modal.textContent).toContain('create.nameLabel')
    expect(modal.textContent).toContain('create.promptLabel')
    expect(modal.textContent).toContain('create.workspace')
    expect(modal.textContent).toContain('create.fullAccess')
    expect(modal.textContent).toContain('create.frequencyLabel')
    expect(modal.textContent).toContain('create.validityLabel')
    expect(view.getAllByRole('switch')).toHaveLength(2)
    expect(view.getByRole('button', { name: 'create.cancel' })).toBeDefined()
    // Full workspace access is not a Schedule option: the control states that
    // instead of collecting a choice the create request cannot carry.
    expect(view.getByRole('button', { name: /create.fullAccess/ }).getAttribute('aria-disabled')).toBe('true')
  })

  it('keeps confirm disabled until the draft names a task and its first run', () => {
    const { view, onConfirm } = dialog()
    expect(confirmOf(view).disabled).toBe(true)

    fireEvent.change(view.getByLabelText('create.nameLabel'), { target: { value: 'Morning briefing' } })
    // The default frequency runs once, so it still needs a run time.
    expect(confirmOf(view).disabled).toBe(true)

    fireEvent.change(view.getByLabelText('create.frequencyDate'), { target: { value: '2026-10-05T07:08' } })
    expect(confirmOf(view).disabled).toBe(false)

    fireEvent.click(confirmOf(view))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('asks for a run time for exactly the frequencies that need one', () => {
    const { view } = dialog()
    const frequency = view.getByLabelText('create.frequencyLabel')
    for (const choice of ['once', 'daily', 'weekly', 'monthly']) {
      fireEvent.change(frequency, { target: { value: choice } })
      expect(view.queryByLabelText('create.frequencyDate')).not.toBeNull()
      expect(view.queryByLabelText('create.intervalValueAria')).toBeNull()
    }
    for (const choice of ['hourly', 'interval']) {
      fireEvent.change(frequency, { target: { value: choice } })
      expect(view.queryByLabelText('create.frequencyDate')).toBeNull()
    }
    // Only the interval choice carries its own quantity and unit.
    fireEvent.change(frequency, { target: { value: 'hourly' } })
    expect(view.queryByLabelText('create.intervalValueAria')).toBeNull()
    fireEvent.change(frequency, { target: { value: 'interval' } })
    expect(view.getByLabelText('create.intervalValueAria')).toBeDefined()
    expect(view.getByLabelText('create.intervalUnitAria')).toBeDefined()
  })

  it('accepts an hourly draft with a name alone, because it counts from creation', () => {
    const { view, onConfirm } = dialog()
    fireEvent.change(view.getByLabelText('create.frequencyLabel'), { target: { value: 'hourly' } })
    expect(confirmOf(view).disabled).toBe(true)
    fireEvent.change(view.getByLabelText('create.nameLabel'), { target: { value: 'Hourly check' } })
    expect(confirmOf(view).disabled).toBe(false)
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ title: 'Hourly check', frequency: 'hourly' })
  })

  it('turns the interval quantity and unit into the submitted interval', () => {
    const { view, onConfirm } = named()
    fireEvent.change(view.getByLabelText('create.frequencyLabel'), { target: { value: 'interval' } })
    fireEvent.change(view.getByLabelText('create.intervalValueAria'), { target: { value: '2' } })
    fireEvent.change(view.getByLabelText('create.intervalUnitAria'), { target: { value: 'hour' } })
    expect(confirmOf(view).disabled).toBe(false)
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ frequency: 'interval', intervalValue: 2, intervalUnit: 'hour' })

    fireEvent.change(view.getByLabelText('create.intervalUnitAria'), { target: { value: 'minute' } })
    fireEvent.change(view.getByLabelText('create.intervalValueAria'), { target: { value: '30' } })
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[1]?.[0]).toMatchObject({ intervalValue: 30, intervalUnit: 'minute' })
  })

  it('states the floor and blocks confirm when the interval is shorter than a minute', () => {
    const { view } = named()
    fireEvent.change(view.getByLabelText('create.frequencyLabel'), { target: { value: 'interval' } })
    fireEvent.change(view.getByLabelText('create.intervalValueAria'), { target: { value: '0' } })
    expect(within(view.getByRole('dialog')).getByRole('alert').textContent).toBe('create.intervalHint')
    expect(confirmOf(view).disabled).toBe(true)
  })

  it('appends a line to the prompt and carries the chosen phrasing preference', () => {
    const { view, onConfirm } = filled()
    fireEvent.click(view.getByRole('button', { name: 'create.promptAppend' }))
    fireEvent.change(view.getByLabelText('create.promptModel'), { target: { value: 'precise' } })
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Summarize the day\n', frequency: 'once', style: 'precise',
    })
  })

  it('reveals the end date and its limit only for a bounded validity, and submits it', () => {
    const { view, onConfirm } = filled()
    expect(view.queryByLabelText('create.validityDate')).toBeNull()
    fireEvent.change(view.getByLabelText('create.validityLabel'), { target: { value: 'until' } })
    expect(within(view.getByRole('dialog')).getByText('create.validityUntilHint')).toBeDefined()
    fireEvent.change(view.getByLabelText('create.validityDate'), { target: { value: '2026-12-31' } })
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ validity: 'until', untilDate: '2026-12-31' })
  })

  it('toggles each push channel and submits both as chosen', () => {
    const { view, onConfirm } = filled()
    const [workBuddy, wecom] = view.getAllByRole('switch')
    fireEvent.click(workBuddy)
    fireEvent.click(workBuddy)
    fireEvent.click(workBuddy)
    fireEvent.click(wecom)
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ pushWorkBuddy: true, pushWecomBot: true })
  })

  it('offers the workspace catalog and submits the chosen one', () => {
    const { view, onConfirm } = filled()
    const trigger = view.getByRole('button', { name: 'create.workspace' })
    // Nothing chosen yet: the draft leaves the workspace to the New Session flow.
    fireEvent.click(trigger)
    const menu = view.getByRole('menu')
    const rows = within(menu).getAllByRole('menuitem')
    expect(rows.map(row => row.textContent)).toEqual(['create.workspaceDefault', 'Alpha', '/work/beta'])

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Alpha' }))
    expect(view.queryByRole('menu')).toBeNull()
    expect(view.getByRole('button', { name: 'Alpha' })).toBeDefined()
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ workspaceId: 'ws-alpha' })
  })

  it('returns to the platform default workspace when the default row is chosen', () => {
    const { view, onConfirm } = filled()
    fireEvent.click(view.getByRole('button', { name: 'create.workspace' }))
    fireEvent.click(within(view.getByRole('menu')).getByRole('menuitem', { name: 'Alpha' }))
    fireEvent.click(view.getByRole('button', { name: 'Alpha' }))
    fireEvent.click(within(view.getByRole('menu')).getByRole('menuitem', { name: 'create.workspaceDefault' }))
    expect(view.getByRole('button', { name: 'create.workspace' })).toBeDefined()
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ workspaceId: undefined })
  })

  it('dismisses the workspace menu without choosing one', () => {
    const { view, onConfirm } = filled()
    fireEvent.click(view.getByRole('button', { name: 'create.workspace' }))
    expect(view.getByRole('menu')).toBeDefined()
    fireEvent.pointerDown(document.body)
    expect(view.queryByRole('menu')).toBeNull()
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ workspaceId: undefined })
  })

  it('submits through the form as well as the confirm button', () => {
    const { view, onConfirm } = filled()
    fireEvent.submit(view.getByLabelText('create.promptLabel').closest('form') as HTMLFormElement)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('does not submit a draft the form cannot complete', () => {
    const { view, onConfirm } = dialog()
    fireEvent.submit(view.getByLabelText('create.promptLabel').closest('form') as HTMLFormElement)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('falls back to the default of every choice whose control reports another value', () => {
    const { view, onConfirm } = filled()
    fireEvent.change(view.getByLabelText('create.promptModel'), { target: { value: 'balanced' } })
    fireEvent.change(view.getByLabelText('create.validityLabel'), { target: { value: 'forever' } })
    // A value outside the offered set is not a frequency, so the draft keeps the
    // one it started with rather than storing an unusable choice.
    fireEvent.change(view.getByLabelText('create.frequencyLabel'), { target: { value: '' } })

    expect((view.getByLabelText('create.promptModel') as HTMLSelectElement).value).toBe('balanced')
    expect((view.getByLabelText('create.validityLabel') as HTMLSelectElement).value).toBe('forever')
    expect((view.getByLabelText('create.frequencyLabel') as HTMLSelectElement).value).toBe('once')
    fireEvent.click(confirmOf(view))
    expect(onConfirm.mock.calls[0]?.[0]).toMatchObject({ frequency: 'once', validity: 'forever' })
  })

  it('opens from a template seed and resets to it on the next open', () => {
    const seed = {
      title: 'Daily AI news', prompt: 'Track the day’s AI news', frequency: 'weekly' as const, runAt: '2026-10-09T09:00',
    }
    const built = dialog({ seed })
    expect((built.view.getByLabelText('create.nameLabel') as HTMLInputElement).value).toBe('Daily AI news')
    expect((built.view.getByLabelText('create.promptLabel') as HTMLTextAreaElement).value).toBe('Track the day’s AI news')
    expect((built.view.getByLabelText('create.frequencyLabel') as HTMLSelectElement).value).toBe('weekly')
    expect((built.view.getByLabelText('create.frequencyDate') as HTMLInputElement).value).toBe('2026-10-09T09:00')

    // Cancel and reopen: the same seed stages itself again.
    fireEvent.change(built.view.getByLabelText('create.nameLabel'), { target: { value: 'Edited' } })
    fireEvent.click(built.view.getByRole('button', { name: 'create.cancel' }))
    expect(built.onClose).toHaveBeenCalledTimes(1)
    built.view.rerender(
      <AutomationCreateModal open={false} workspaces={WORKSPACES} onClose={built.onClose} onConfirm={built.onConfirm} t={t} />,
    )
    built.view.rerender(
      <AutomationCreateModal open seed={seed} workspaces={WORKSPACES} onClose={built.onClose} onConfirm={built.onConfirm} t={t} />,
    )
    expect((built.view.getByLabelText('create.nameLabel') as HTMLInputElement).value).toBe('Daily AI news')
    expect(built.view.getAllByRole('switch').map(node => node.getAttribute('aria-checked'))).toEqual(['false', 'false'])
  })

  it('opens from an interval seed with its quantity and unit staged', () => {
    const { view } = dialog({
      seed: {
        title: 'Interview prep', prompt: 'Review interview notes', frequency: 'interval',
        intervalValue: 2, intervalUnit: 'hour',
      },
    })
    expect((view.getByLabelText('create.frequencyLabel') as HTMLSelectElement).value).toBe('interval')
    expect((view.getByLabelText('create.intervalValueAria') as HTMLInputElement).value).toBe('2')
    expect((view.getByLabelText('create.intervalUnitAria') as HTMLSelectElement).value).toBe('hour')
    expect(confirmOf(view).disabled).toBe(false)
  })

  it('opens an empty draft when no seed is given', () => {
    const { view } = dialog()
    expect((view.getByLabelText('create.nameLabel') as HTMLInputElement).value).toBe('')
    expect((view.getByLabelText('create.promptLabel') as HTMLTextAreaElement).value).toBe('')
    expect((view.getByLabelText('create.frequencyLabel') as HTMLSelectElement).value).toBe('once')
    expect((view.getByLabelText('create.validityLabel') as HTMLSelectElement).value).toBe('forever')
  })
})
