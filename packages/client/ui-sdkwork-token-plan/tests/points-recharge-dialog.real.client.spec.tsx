// @vitest-environment jsdom
// The unmocked composition: this spec renders the real Order-owned recharge
// dialog, so the copy projection and the balance prop are proven against the
// component the browser actually mounts rather than a stub of it. The other
// spec in this directory stubs the dialog to assert the host contract.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { PointsRechargeDialogProps } from '../src/client/PointsRechargeDialog.tsx'
import { PointsRechargeDialog } from '../src/client/PointsRechargeDialog.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof zh): string => zh[key]

describe('PointsRechargeDialog against the Order dialog', () => {
  it('renders the compute-account recharge surface with the wallet balance and its empty catalog', async () => {
    const service = {
      listPackages: vi.fn().mockResolvedValue([]),
      createOrder: vi.fn(),
      getOrderStatus: vi.fn(),
    }
    const props: PointsRechargeDialogProps = {
      open: true,
      onClose: vi.fn(),
      readService: () => service,
      readBalance: vi.fn().mockResolvedValue(42.5),
      t,
    } as PointsRechargeDialogProps
    render(<PointsRechargeDialog {...props} />)

    // The Order dialog owns the surface; the host contributes the localized
    // title, the wallet figure, and the recharge terms notice.
    expect(await screen.findByText('算力账户充值')).not.toBeNull()
    expect(await screen.findByText('暂无可用充值套餐')).not.toBeNull()
    expect(screen.getByText('我的算力账户').parentElement?.textContent).toContain('42.5')
    expect(screen.getByText('算力账户余额用于模型调用。')).not.toBeNull()
    await waitFor(() => { expect(service.listPackages).toHaveBeenCalledTimes(1) })
  })
})
