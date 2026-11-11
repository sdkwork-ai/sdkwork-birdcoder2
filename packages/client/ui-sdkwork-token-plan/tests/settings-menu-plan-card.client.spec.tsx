// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SettingsMenuPlanCardProps } from '../src/client/SettingsMenuPlanCard.tsx'
import { SettingsMenuPlanCard } from '../src/client/SettingsMenuPlanCard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof zh): string => zh[key]

function card(overrides: Partial<SettingsMenuPlanCardProps> = {}) {
  const close = vi.fn()
  const openTokenPlan = vi.fn()
  const readSummary = vi.fn().mockResolvedValue({
    planName: '体验版',
    points: 610.57,
    active: true,
  })
  const props: SettingsMenuPlanCardProps = {
    close,
    signedIn: () => true,
    readSummary,
    openTokenPlan,
    t,
    ...overrides,
  } as SettingsMenuPlanCardProps
  render(<SettingsMenuPlanCard {...props} />)
  return { close, openTokenPlan, readSummary }
}

describe('SettingsMenuPlanCard', () => {
  it('renders the plan and balance, then leaves the menu for the Token Plan surface', async () => {
    const { close, openTokenPlan } = card()

    expect(screen.getByText('套餐')).not.toBeNull()
    expect(screen.getByText('积分余额')).not.toBeNull()
    // The loading placeholders reserve the value line until the summary lands.
    expect(screen.getByTestId('settings-menu-points-skeleton')).not.toBeNull()
    expect(await screen.findByText('体验版')).not.toBeNull()
    expect(screen.getByTestId('settings-menu-points-value').textContent).toBe('610.57')

    fireEvent.click(screen.getByRole('button', { name: '升级套餐' }))
    expect(close).toHaveBeenCalledTimes(1)
    expect(openTokenPlan).toHaveBeenCalledTimes(1)
    // Closing the menu is requested before navigation, so the destination is
    // never painted underneath the popover.
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(openTokenPlan.mock.invocationCallOrder[0])

    fireEvent.click(screen.getByRole('button', { name: '购买积分' }))
    expect(openTokenPlan).toHaveBeenCalledTimes(2)
  })

  it('names the free tier when the account has no active plan', async () => {
    card({
      readSummary: vi.fn().mockResolvedValue({
        planName: undefined, points: undefined, active: false,
      }),
    })
    expect(await screen.findByText('免费版')).not.toBeNull()
    expect(screen.getByTestId('settings-menu-points-value').textContent).toBe('—')
  })

  it('shows a retry action for a failed read and recovers on the next attempt', async () => {
    const readSummary = vi.fn()
      .mockRejectedValueOnce(new Error('gateway down'))
      .mockResolvedValueOnce({ planName: '体验版', points: 5, active: true })
    card({ readSummary })

    // Both figures read as unavailable rather than as a real free plan.
    expect(await screen.findByRole('button', { name: '重试' })).not.toBeNull()
    expect(screen.getAllByText('—')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => { expect(screen.getByTestId('settings-menu-points-value').textContent).toBe('5') })
    expect(readSummary).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('renders nothing while signed out', () => {
    const readSummary = vi.fn()
    card({ signedIn: () => false, readSummary })
    expect(screen.queryByTestId('settings-menu-plan-card')).toBeNull()
    expect(readSummary).not.toHaveBeenCalled()
  })
})
