// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PointsRechargeDialogProps } from '../src/client/PointsRechargeDialog.tsx'
import { PointsRechargeDialog } from '../src/client/PointsRechargeDialog.tsx'
import { zh } from '../src/client/locales.ts'

/** Props the Order-owned dialog receives from the host wrapper. */
interface RechargeDialogCall {
  copy: { myPoints: string; title: string }
  currentPoints: number | null | undefined
  isOpen: boolean
  onClose: () => void
  onCompleted: () => Promise<void> | void
  service: unknown
}

vi.mock('@sdkwork/order-pc-recharge', () => ({
  SdkworkPointsRechargeDialog: (props: RechargeDialogCall) => (
    <div data-testid="recharge-dialog" data-open={String(props.isOpen)}>
      {props.copy.title}·{props.copy.myPoints}·{String(props.currentPoints)}
      <button type="button" onClick={() => { props.onClose() }}>order-close</button>
      <button type="button" onClick={() => { void props.onCompleted() }}>order-complete</button>
    </div>
  ),
}))

afterEach(cleanup)

const t = (key: keyof typeof zh): string => zh[key]

function dialog(overrides: Partial<PointsRechargeDialogProps> = {}, open = true) {
  const onClose = vi.fn()
  const service = { listPackages: vi.fn(), createOrder: vi.fn(), getOrderStatus: vi.fn() }
  const readService = vi.fn(() => service)
  const readBalance = vi.fn().mockResolvedValue(610.57)
  const props: PointsRechargeDialogProps = {
    open,
    onClose,
    readService,
    readBalance,
    t,
    ...overrides,
  } as PointsRechargeDialogProps
  render(<PointsRechargeDialog {...props} />)
  return { onClose, readService, readBalance, service }
}

/** Read the dialog body the Order component rendered. */
function body(): string {
  return screen.getByTestId('recharge-dialog').textContent ?? ''
}

describe('PointsRechargeDialog', () => {
  it('stays unmounted and reads nothing while the shell has it closed', () => {
    const { readService, readBalance } = dialog({}, false)
    expect(screen.queryByTestId('recharge-dialog')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(readService).not.toHaveBeenCalled()
    expect(readBalance).not.toHaveBeenCalled()
  })

  it('opens the Order recharge dialog with the wallet balance for its header', async () => {
    const { service, onClose } = dialog()

    expect(body()).toContain('算力账户充值')
    // The Order dialog owns package selection, payment, and settlement; the
    // host adds only the copy and the wallet figure.
    expect(screen.getByTestId('recharge-dialog').dataset.open).toBe('true')
    await waitFor(() => { expect(body()).toContain('610.57') })
    expect(service.listPackages).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'order-close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the Token Bank balance at four decimal places in the header', async () => {
    const readBalance = vi.fn().mockResolvedValue(1.234567)
    dialog({ readBalance })

    // The Order dialog prints the figure it receives, so the host rounds it.
    await waitFor(() => { expect(body()).toContain('1.2346') })
  })

  it('re-reads the balance once a payment settles, so the header shows the credited points', async () => {
    const readBalance = vi.fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(510)
    dialog({ readBalance })
    await waitFor(() => { expect(body()).toContain('10') })

    fireEvent.click(screen.getByRole('button', { name: 'order-complete' }))
    await waitFor(() => { expect(body()).toContain('510') })
    expect(readBalance).toHaveBeenCalledTimes(2)
  })

  it('keeps the last header balance when the wallet read fails', async () => {
    const readBalance = vi.fn().mockRejectedValue(new Error('gateway down'))
    dialog({ readBalance })

    await waitFor(() => { expect(readBalance).toHaveBeenCalledTimes(1) })
    // No balance was ever read: the header stays on the Order dialog's
    // placeholder instead of inventing a figure.
    expect(body()).toContain('null')
  })

  it('shows the placeholder when the wallet reports no balance yet', async () => {
    const readBalance = vi.fn().mockResolvedValue(undefined)
    dialog({ readBalance })

    await waitFor(() => { expect(readBalance).toHaveBeenCalledTimes(1) })
    expect(body()).toContain('null')
  })

  it('reports a deployment with no API environment instead of opening a dead surface', () => {
    const onClose = vi.fn()
    dialog({ readService: () => undefined, onClose })

    expect(screen.queryByTestId('recharge-dialog')).toBeNull()
    const modal = screen.getByRole('dialog', { name: '算力账户充值' })
    expect(modal.textContent).toContain('请先在设置中配置 SDKWork API 环境。')
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
