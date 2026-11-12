// @vitest-environment jsdom
// The unmocked composition: this spec renders the real Order-owned recharge
// dialog, so the copy projection and the balance prop are proven against the
// component the browser actually mounts rather than a stub of it. The other
// spec in this directory stubs the dialog to assert the host contract.
//
// Only the sibling UI kit's Radix-backed chrome is stubbed: a guest UI mounted
// here resolves Radix through the sibling checkout's own store, whose React
// instance is not the renderer's, so the portal primitives cannot run inside
// this process. The stubs keep the roles and labels the assertions use, and the
// vendor dialog's own state machine still runs unmodified.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PointsRechargeDialogProps } from '../src/client/PointsRechargeDialog.tsx'
import { PointsRechargeDialog } from '../src/client/PointsRechargeDialog.tsx'
import { zh } from '../src/client/locales.ts'

interface BoxProps {
  children?: ReactNode
}

vi.mock('@sdkwork/ui-pc-react', () => ({
  Button: ({ children, ...rest }: BoxProps & Record<string, unknown>) => <button type="button" {...rest}>{children}</button>,
  Modal: ({ children, open }: BoxProps & { open?: boolean }) => (open ? <div>{children}</div> : null),
  ModalBody: ({ children }: BoxProps) => <div>{children}</div>,
  ModalClose: ({ children, ...rest }: BoxProps & Record<string, unknown>) => <button type="button" {...rest}>{children}</button>,
  ModalContent: ({ children, ...rest }: BoxProps & Record<string, unknown>) => <div role="dialog" {...rest}>{children}</div>,
  ModalHeader: ({ children }: BoxProps) => <div>{children}</div>,
  ModalTitle: ({ children, ...rest }: BoxProps & Record<string, unknown>) => <h2 {...rest}>{children}</h2>,
  StatusNotice: ({ children, title }: BoxProps & { title?: ReactNode }) => <div>{title}{children}</div>,
}))

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

  it('localizes the custom-amount top-up the Order dialog offers next to the catalog', async () => {
    const service = {
      listPackages: vi.fn().mockResolvedValue([
        {
          bonusPoints: 0,
          currencyCode: 'CNY',
          grantAmount: 500,
          id: 'recharge-500',
          points: 500_000_000,
          priceAmount: 50,
        },
      ]),
      createOrder: vi.fn(),
      getOrderStatus: vi.fn(),
      readSettings: vi.fn().mockResolvedValue({
        baseCurrencyCode: 'CNY',
        basePointsPerCny: 10,
        currencyToCnyRates: { CNY: '1' },
      }),
    }
    const props: PointsRechargeDialogProps = {
      open: true,
      onClose: vi.fn(),
      readService: () => service,
      readBalance: vi.fn().mockResolvedValue(42.5),
      t,
    } as PointsRechargeDialogProps
    render(<PointsRechargeDialog {...props} />)

    // The free-amount purchase is the host's copy too: the catalog tile, the
    // accepted range, and the field itself all come from the tokenPlan dictionary.
    fireEvent.click(await screen.findByRole('button', { name: /自定义金额/ }))
    expect(await screen.findByLabelText('自定义金额')).not.toBeNull()
    expect(screen.getByText('单笔 1.00 - 10000.00 元')).not.toBeNull()
    expect(screen.getByPlaceholderText('输入充值金额')).not.toBeNull()
  })
})
