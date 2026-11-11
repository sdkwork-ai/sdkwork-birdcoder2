// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsPointsSection, type SettingsPointsSectionProps } from '../src/client/SettingsPointsSection.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof zh): string => zh[key]

function section(overrides: Partial<SettingsPointsSectionProps> = {}, signedIn = true) {
  const close = vi.fn()
  const openTokenPlan = vi.fn()
  const signIn = vi.fn()
  const readPoints = vi.fn().mockResolvedValue({
    planName: '体验版',
    active: true,
    points: 610.57,
    available: 600.57,
    frozen: 10,
    history: [
      {
        id: 'h1',
        changeAmount: -4.34,
        afterBalance: 610.57,
        sourceType: 'usage',
        remark: '自动化任务',
        createdAt: '2026-11-11T09:07:00Z',
      },
    ],
  })
  const props: SettingsPointsSectionProps = {
    close,
    useSignedIn: (selector: (value: boolean) => boolean) => selector(signedIn),
    readPoints,
    openTokenPlan,
    signIn,
    t,
    ...overrides,
  } as SettingsPointsSectionProps
  render(<SettingsPointsSection {...props} />)
  return { close, openTokenPlan, signIn, readPoints }
}

describe('SettingsPointsSection', () => {
  it('shows the plan, total, wallet split, and recent activity', async () => {
    const { close, openTokenPlan } = section()

    expect(await screen.findByText('体验版')).not.toBeNull()
    expect(screen.getByText('总剩余积分')).not.toBeNull()
    expect(screen.getByText('610.57')).not.toBeNull()
    expect(screen.getAllByText('600.57').length).toBeGreaterThan(0)
    expect(screen.getAllByText('10').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: '变动明细' }))
    expect(await screen.findByText('自动化任务')).not.toBeNull()
    expect(screen.getByText('-4.34')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '升级套餐' }))
    expect(close).toHaveBeenCalledTimes(1)
    expect(openTokenPlan).toHaveBeenCalledTimes(1)
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(openTokenPlan.mock.invocationCallOrder[0])
  })

  it('retries a failed read', async () => {
    const readPoints = vi.fn()
      .mockRejectedValueOnce(new Error('gateway down'))
      .mockResolvedValueOnce({
        planName: '体验版', active: true, points: 6, available: 6, frozen: 0, history: [],
      })
    section({ readPoints })

    fireEvent.click(await screen.findByRole('button', { name: '重新加载' }))
    await waitFor(() => { expect(screen.getAllByText('6').length).toBeGreaterThan(0) })
    expect(readPoints).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '重新加载' })).toBeNull()
  })

  it('asks a signed-out account to sign in without reading points', () => {
    const { signIn, readPoints } = section({}, false)

    expect(screen.getByText('登录后查看套餐与积分')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '登录 / 注册' }))
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(readPoints).not.toHaveBeenCalled()
  })

  it('renders an empty activity state', async () => {
    section({
      readPoints: vi.fn().mockResolvedValue({
        planName: '体验版', active: true, points: 0, available: 0, frozen: 0, history: [],
      }),
    })
    fireEvent.click(await screen.findByRole('tab', { name: '变动明细' }))
    expect(screen.getByText('暂无积分记录')).not.toBeNull()
  })
})
