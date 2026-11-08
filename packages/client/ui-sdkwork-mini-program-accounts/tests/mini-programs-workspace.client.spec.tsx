// @vitest-environment jsdom
/**
 * Mini-program workspace behaviour: the account ledger, create/edit forms,
 * enable toggling, deletion confirmation, and the backend login check.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SdkworkBackendClient } from '@sdkwork/iam-backend-sdk'
import { MiniProgramsWorkspace } from '../src/client/MiniProgramsWorkspace.tsx'
import { zh, type MiniProgramKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: MiniProgramKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as Parameters<typeof MiniProgramsWorkspace>[0]['t']

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acc-1',
    resourceAccountKind: 'mini_program',
    providerCode: 'wechat_mini_program',
    providerAccountId: 'wx1234567890abcdef',
    displayName: 'My mini program',
    enabled: 1,
    integrationId: 'int-1',
    updatedAt: '2026-01-02T03:04:05.000Z',
    ...overrides,
  }
}

function makeBackend() {
  const resourceAccounts = {
    list: vi.fn(async () => ({ items: [row()] })),
    create: vi.fn(async (body: Record<string, unknown>) => ({
      id: 'acc-new',
      resourceAccountKind: 'mini_program',
      integrationId: 'int-new',
      ...body,
    })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => undefined),
    miniProgramLoginChecks: { create: vi.fn(async () => ({})) },
  }
  const integrations = {
    list: vi.fn(async () => ({ items: [] as Record<string, unknown>[] })),
    create: vi.fn(async () => ({ id: 'int-new' })),
    update: vi.fn(async () => ({})),
  }
  const client = { iamOauth: { iam: { oauth: { resourceAccounts, integrations } } } } as unknown as SdkworkBackendClient
  return { client, resourceAccounts, integrations }
}

describe('MiniProgramsWorkspace ledger', () => {
  it('shows a loading state and then the account rows', async () => {
    const api = makeBackend()
    let release: (() => void) | undefined
    api.resourceAccounts.list.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => { resolve({ items: [row()] }) }
    }))
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    expect(screen.getByText(zh['common.loading'])).toBeTruthy()
    await act(async () => { release!() })
    expect(await screen.findByText('My mini program')).toBeTruthy()
    expect(screen.getByText('wx1234567890abcdef')).toBeTruthy()
    expect(screen.getByText(zh['account.enabled'])).toBeTruthy()
    expect(screen.getByText(zh['account.integrationBound'])).toBeTruthy()
    expect(screen.getByText('2026-01-02 03:04')).toBeTruthy()
    expect(screen.getByText(zh['section.permissionHint'])).toBeTruthy()
  })

  it('renders disabled, unlinked, and timestamp-less rows', async () => {
    const api = makeBackend()
    api.resourceAccounts.list.mockResolvedValue({
      items: [row({ enabled: 0, integrationId: undefined, updatedAt: undefined })],
    })
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText(zh['account.disabled'])).toBeTruthy()
    expect(screen.getByText(zh['account.integrationNone'])).toBeTruthy()
    expect(screen.getAllByText(zh['common.none']).length).toBeGreaterThanOrEqual(1)
  })

  it('renders an empty ledger', async () => {
    const api = makeBackend()
    api.resourceAccounts.list.mockResolvedValue({ items: [] })
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText(zh['account.empty'])).toBeTruthy()
  })

  it('reports a failed read with a retry that recovers', async () => {
    const api = makeBackend()
    api.resourceAccounts.list.mockRejectedValueOnce(new Error('ledger exploded'))
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('ledger exploded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['common.retry'] }))
    expect(await screen.findByText('My mini program')).toBeTruthy()
  })

  it('falls back to the load copy when a rejection carries no message', async () => {
    const api = makeBackend()
    api.resourceAccounts.list.mockRejectedValueOnce({})
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText(zh['error.load'])).toBeTruthy()
  })
})

describe('MiniProgramsWorkspace forms', () => {
  it('validates and creates an account, then closes the form', async () => {
    const api = makeBackend()
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['account.add'] }))

    fireEvent.click(screen.getByRole('button', { name: zh['create.submit'] }))
    expect(screen.getByText(zh['problem.appIdRequired'])).toBeTruthy()
    fireEvent.change(screen.getByLabelText(zh['create.appId']), { target: { value: 'wx-new' } })
    fireEvent.click(screen.getByRole('button', { name: zh['create.submit'] }))
    expect(screen.getByText(zh['problem.appSecretRequired'])).toBeTruthy()
    fireEvent.change(screen.getByLabelText(zh['create.appSecret']), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: zh['create.submit'] }))
    expect(screen.getByText(zh['problem.displayNameRequired'])).toBeTruthy()

    fireEvent.change(screen.getByLabelText(zh['create.displayName']), { target: { value: 'New mini' } })
    fireEvent.click(screen.getByLabelText(zh['create.enabled']))
    fireEvent.click(screen.getByRole('button', { name: zh['create.submit'] }))
    await waitFor(() => { expect(api.resourceAccounts.create).toHaveBeenCalledTimes(1) })
    expect(api.integrations.create).toHaveBeenCalledWith(expect.objectContaining({
      providerClientId: 'wx-new',
      providerClientSecret: 'secret',
      enabled: false,
    }))
    await waitFor(() => { expect(screen.queryByLabelText(zh['create.appId'])).toBeNull() })
  })

  it('keeps a failed creation visible and cancels cleanly', async () => {
    const api = makeBackend()
    api.resourceAccounts.create.mockRejectedValueOnce(new Error('account create denied'))
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['account.add'] }))
    fireEvent.change(screen.getByLabelText(zh['create.appId']), { target: { value: 'wx-new' } })
    fireEvent.change(screen.getByLabelText(zh['create.appSecret']), { target: { value: 'secret' } })
    fireEvent.change(screen.getByLabelText(zh['create.displayName']), { target: { value: 'New mini' } })
    fireEvent.click(screen.getByRole('button', { name: zh['create.submit'] }))
    expect(await screen.findByText('account create denied')).toBeTruthy()
    expect(screen.getByLabelText(zh['create.appId'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['common.cancel'] }))
    expect(screen.queryByLabelText(zh['create.appId'])).toBeNull()
  })

  it('closes the create and edit drawers from their close controls', async () => {
    const api = makeBackend()
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')

    fireEvent.click(screen.getByRole('button', { name: zh['account.add'] }))
    expect(screen.getByRole('dialog', { name: zh['create.title'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['close'] }))
    expect(screen.queryByLabelText(zh['create.appId'])).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: zh['common.edit'] }))
    expect(screen.getByRole('dialog', { name: zh['edit.title'] })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['close'] }))
    expect(screen.queryByLabelText(zh['edit.appId'])).toBeNull()
  })

  it('edits the profile and rotates credentials only when supplied', async () => {
    const api = makeBackend()
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['common.edit'] }))
    expect(screen.getByLabelText<HTMLInputElement>(zh['edit.appId']).value).toBe('wx1234567890abcdef')
    fireEvent.change(screen.getByLabelText(zh['edit.displayName']), { target: { value: 'Renamed' } })
    fireEvent.change(screen.getByLabelText(zh['edit.appId']), { target: { value: 'wx-rotated' } })
    fireEvent.change(screen.getByLabelText(/^AppSecret/u), { target: { value: 'rotated' } })
    fireEvent.click(screen.getByRole('button', { name: zh['edit.submit'] }))
    await waitFor(() => { expect(api.resourceAccounts.update).toHaveBeenCalledWith('acc-1', {
      displayName: 'Renamed',
      providerAccountId: 'wx-rotated',
      providerClientSecret: 'rotated',
    }) })
    expect(api.integrations.update).toHaveBeenCalledWith('int-1', { displayName: 'Renamed' })
    await waitFor(() => { expect(screen.queryByLabelText(zh['edit.appId'])).toBeNull() })
  })

  it('validates the edit form, keeps a failure visible, and cancels', async () => {
    const api = makeBackend()
    api.resourceAccounts.update.mockRejectedValueOnce(new Error('edit denied'))
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['common.edit'] }))
    fireEvent.change(screen.getByLabelText(zh['edit.displayName']), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: zh['edit.submit'] }))
    expect(screen.getByText(zh['problem.displayNameRequired'])).toBeTruthy()
    fireEvent.change(screen.getByLabelText(zh['edit.displayName']), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByRole('button', { name: zh['edit.submit'] }))
    expect(await screen.findByText('edit denied')).toBeTruthy()
    expect(screen.getByLabelText(zh['edit.appId'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['common.cancel'] }))
    expect(screen.queryByLabelText(zh['edit.appId'])).toBeNull()
  })
})

describe('MiniProgramsWorkspace commands', () => {
  it('disables and re-enables an account', async () => {
    const api = makeBackend()
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['account.disable'] }))
    await waitFor(() => { expect(api.resourceAccounts.update).toHaveBeenCalledWith('acc-1', { enabled: false }) })
    expect(api.integrations.update).toHaveBeenCalledWith('int-1', { enabled: false })
  })

  it('enables a disabled account', async () => {
    const api = makeBackend()
    api.resourceAccounts.list.mockResolvedValue({ items: [row({ enabled: 0 })] })
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['account.enable'] }))
    await waitFor(() => { expect(api.resourceAccounts.update).toHaveBeenCalledWith('acc-1', { enabled: true }) })
    expect(api.integrations.update).toHaveBeenCalledWith('int-1', { enabled: true })
  })

  it('reports a failed toggle', async () => {    const api = makeBackend()
    api.resourceAccounts.update.mockRejectedValueOnce(new Error('toggle denied'))
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['account.disable'] }))
    expect(await screen.findByText('toggle denied')).toBeTruthy()
  })

  it('deletes only after the inline confirmation', async () => {
    const api = makeBackend()
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['common.delete'] }))
    expect(api.resourceAccounts.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh['common.cancel'] }))
    expect(api.resourceAccounts.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh['common.delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['common.confirmDelete'] }))
    await waitFor(() => { expect(api.resourceAccounts.delete).toHaveBeenCalledWith('acc-1') })
  })

  it('keeps the row and confirmation on a failed delete', async () => {
    const api = makeBackend()
    api.resourceAccounts.delete.mockRejectedValueOnce(new Error('delete denied'))
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['common.delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['common.confirmDelete'] }))
    expect(await screen.findByText('delete denied')).toBeTruthy()
    expect(screen.getByText('My mini program')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['common.cancel'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['common.delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['common.confirmDelete'] }))
    await waitFor(() => { expect(api.resourceAccounts.delete).toHaveBeenCalledTimes(2) })
  })

  it('queues the login check and shows the account name', async () => {
    const api = makeBackend()
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['account.loginCheck'] }))
    await waitFor(() => { expect(api.resourceAccounts.miniProgramLoginChecks.create).toHaveBeenCalledWith('acc-1', {}) })
    expect(screen.getByText(zh['account.loginCheckQueued'].replace('{name}', 'My mini program'))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['common.cancel'] }))
    expect(screen.queryByText(zh['account.loginCheckQueued'].replace('{name}', 'My mini program'))).toBeNull()
  })

  it('reports a failed login check', async () => {
    const api = makeBackend()
    api.resourceAccounts.miniProgramLoginChecks.create.mockRejectedValueOnce(new Error('check denied'))
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['account.loginCheck'] }))
    expect(await screen.findByText('check denied')).toBeTruthy()
  })

  it('refreshes the ledger from the toolbar', async () => {
    const api = makeBackend()
    render(<MiniProgramsWorkspace client={api.client} t={t} />)
    await screen.findByText('My mini program')
    fireEvent.click(screen.getByRole('button', { name: zh['common.refresh'] }))
    await waitFor(() => { expect(api.resourceAccounts.list).toHaveBeenCalledTimes(2) })
  })
})
