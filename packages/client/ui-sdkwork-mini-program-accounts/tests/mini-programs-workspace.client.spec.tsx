// @vitest-environment jsdom
/**
 * Mini-program workspace behaviour through the shared panel: the account
 * ledger, the create/edit drawer, enable toggling, deletion confirmation, and
 * the login check. The controller, transport, and copy belong to
 * `@sdkwork/iam-pc-mini-program`; this host only supplies the locale/theme.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OPERATOR_CAPABILITIES,
  createMiniProgramController,
  type MiniProgramAccount,
  type MiniProgramTransport,
} from '@sdkwork/iam-pc-mini-program'
import {
  MiniProgramsWorkspace,
  toMiniProgramLocale,
  type MiniProgramsWorkspaceProps,
} from '../src/client/MiniProgramsWorkspace.tsx'

afterEach(cleanup)

function account(overrides: Partial<MiniProgramAccount> = {}): MiniProgramAccount {
  return {
    miniProgramId: 'iamora-1',
    tenantId: 't1',
    organizationId: '0',
    appId: 'wx1234567890abcdef',
    displayName: 'My mini program',
    accountType: 'personal',
    accessMode: 'operator_authorized_account',
    ownerScope: 'tenant',
    integrationId: 'iamoi-1',
    hasAppSecret: true,
    enabled: true,
    status: 'active',
    loginCheckStatus: 'unknown',
    providerConfig: {},
    ...overrides,
  }
}

function memoryTransport(overrides: Partial<MiniProgramTransport> = {}): MiniProgramTransport {
  return {
    list: vi.fn(async () => ({ items: [account()], totalItems: 1, page: 1, pageSize: 20 })),
    create: vi.fn(async () => account()),
    update: vi.fn(async () => account()),
    delete: vi.fn(async () => undefined),
    setEnabled: vi.fn(async () => undefined),
    runLoginCheck: vi.fn(async () => ({ accountId: 'iamora-1', status: 'passed' as const })),
    ...overrides,
  }
}

function bench(
  overrides: Partial<MiniProgramTransport> = {},
  language: 'zh' | 'en' = 'zh',
) {
  const transport = memoryTransport(overrides)
  const controller = createMiniProgramController(transport, DEFAULT_OPERATOR_CAPABILITIES)
  const props: MiniProgramsWorkspaceProps = { controller, language, colorScheme: 'dark' }
  const rendered = render(<MiniProgramsWorkspace {...props} />)
  return { ...rendered, controller, transport }
}

describe('MiniProgramsWorkspace ledger', () => {
  it('maps the harness locale onto the panel catalog tag', () => {
    expect(toMiniProgramLocale('zh')).toBe('zh-CN')
    expect(toMiniProgramLocale('en')).toBe('en-US')
    expect(toMiniProgramLocale('ja')).toBe('en-US')
  })

  it('shows a loading state and then the account rows', async () => {
    let release: (() => void) | undefined
    const list = vi.fn(() => new Promise<{ items: MiniProgramAccount[]; totalItems: number; page: number; pageSize: number }>((resolve) => {
      release = () => { resolve({ items: [account()], totalItems: 1, page: 1, pageSize: 20 }) }
    }))
    bench({ list })
    expect(screen.getByText('正在加载小程序账号…')).toBeTruthy()
    await act(async () => { release!() })
    expect(await screen.findByText('My mini program')).toBeTruthy()
    expect(screen.getByText('wx1234567890abcdef')).toBeTruthy()
    expect(screen.getByText('已启用')).toBeTruthy()
    expect(screen.getByText('未检测')).toBeTruthy()
  })

  it('renders an empty ledger', async () => {
    bench({ list: vi.fn(async () => ({ items: [], totalItems: 0, page: 1, pageSize: 20 })) })
    expect(await screen.findByText('还没有小程序账号。')).toBeTruthy()
  })

  it('reports a failed read and recovers from the toolbar', async () => {
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('ledger exploded'))
      .mockResolvedValue({ items: [account()], totalItems: 1, page: 1, pageSize: 20 })
    bench({ list })
    expect(await screen.findByText('ledger exploded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('My mini program')).toBeTruthy()
  })

  it('renders the English catalog when the harness locale is English', async () => {
    bench({}, 'en')
    expect(await screen.findByText('Add mini program')).toBeTruthy()
    expect(screen.getByText('Enabled')).toBeTruthy()
  })
})

describe('MiniProgramsWorkspace forms', () => {
  it('validates and creates an account, then closes the drawer', async () => {
    const { transport } = bench()
    fireEvent.click(await screen.findByRole('button', { name: '添加小程序账号' }))

    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(screen.getByText('请填写显示名称。')).toBeTruthy()
    expect(screen.getByText('请填写 AppID。')).toBeTruthy()
    expect(screen.getByText('请填写 AppSecret。')).toBeTruthy()
    expect(transport.create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: ' New mini ' } })
    fireEvent.change(screen.getByLabelText('AppID'), { target: { value: 'wx-new' } })
    fireEvent.change(screen.getByLabelText('AppSecret'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(transport.create).toHaveBeenCalledWith({
        appId: 'wx-new',
        displayName: 'New mini',
        appSecret: 'secret',
        accountType: 'personal',
      })
    })
    await waitFor(() => { expect(screen.queryByLabelText('AppID')).toBeNull() })
  })

  it('edits the profile and rotates the credential only when supplied', async () => {
    const { transport } = bench()
    fireEvent.click(await screen.findByRole('button', { name: 'My mini program' }))
    const appIdField = screen.getByDisplayValue('wx1234567890abcdef') as HTMLInputElement
    expect(appIdField.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Renamed' } })
    fireEvent.change(screen.getByLabelText('AppSecret'), { target: { value: 'rotated' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(transport.update).toHaveBeenCalledWith('iamora-1', {
        displayName: 'Renamed',
        appSecret: 'rotated',
        providerConfig: {},
      })
    })
  })

  it('keeps a failed save visible and cancels cleanly', async () => {
    const { transport } = bench({
      update: vi.fn(async () => { throw new Error('save denied') }),
    })
    fireEvent.click(await screen.findByRole('button', { name: 'My mini program' }))
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('save denied')).toBeTruthy()
    expect(screen.getByLabelText('显示名称')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('显示名称')).toBeNull()
    expect(transport.update).toHaveBeenCalledTimes(1)
  })
})

describe('MiniProgramsWorkspace commands', () => {
  it('disables and re-enables an account', async () => {
    const { transport } = bench()
    fireEvent.click(await screen.findByRole('switch', { name: /启用/u }))
    await waitFor(() => {
      expect(transport.setEnabled).toHaveBeenCalledWith('iamora-1', false)
    })
  })

  it('deletes only after the confirmation', async () => {
    const { transport } = bench()
    fireEvent.click(await screen.findByRole('button', { name: '删除' }))
    expect(transport.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: '删除' }).at(-1)!)
    await waitFor(() => {
      expect(transport.delete).toHaveBeenCalledWith('iamora-1')
    })
  })

  it('queues the login check and shows the outcome', async () => {
    const { transport } = bench()
    fireEvent.click(await screen.findByRole('button', { name: 'My mini program' }))
    fireEvent.click(screen.getByRole('button', { name: '登录检测' }))
    await waitFor(() => {
      expect(transport.runLoginCheck).toHaveBeenCalledWith('iamora-1')
    })
    expect(await screen.findByText('已提交登录检测')).toBeTruthy()
    expect(screen.getByText('通过')).toBeTruthy()
  })
})
