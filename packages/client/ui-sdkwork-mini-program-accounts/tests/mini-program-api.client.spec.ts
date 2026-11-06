// @vitest-environment jsdom
/**
 * Mini-program account transport: row projection from the IAM backend shapes,
 * the create flow that reuses/creates the login integration, duplicate refusal,
 * enable/disable, deletion, login check, and credential/profile edits.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createMiniProgramAccount, deleteMiniProgramAccount, listMiniProgramAccounts, queueMiniProgramLoginCheck,
  setMiniProgramEnabled, toMiniProgramAccount, toMiniProgramAccounts, updateMiniProgramAccount,
  type MiniProgramBackend,
} from '../src/client/miniProgramApi.ts'

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'acc-1',
    resourceAccountKind: 'mini_program',
    providerCode: 'wechat_mini_program',
    providerAccountId: 'wx1234567890abcdef',
    displayName: 'My mini program',
    enabled: 1,
    integrationId: 'int-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function makeBackend() {
  const resourceAccounts = {
    list: vi.fn(async () => ({ items: [] as Record<string, unknown>[] })),
    create: vi.fn(async (body: Record<string, unknown>) => ({ id: 'acc-new', ...body })),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => undefined),
    miniProgramLoginChecks: { create: vi.fn(async () => ({})) },
  }
  const integrations = {
    list: vi.fn(async () => ({ items: [] as Record<string, unknown>[] })),
    create: vi.fn(async () => ({ id: 'int-new' })),
    update: vi.fn(async () => ({})),
  }
  const backend = { iamOauth: { iam: { oauth: { resourceAccounts, integrations } } } } as unknown as MiniProgramBackend
  return { backend, resourceAccounts, integrations }
}

describe('miniProgramApi row projection', () => {
  it('projects camelCase and snake_case rows and drops other account kinds', () => {
    expect(toMiniProgramAccount(row())).toEqual({
      id: 'acc-1',
      appId: 'wx1234567890abcdef',
      displayName: 'My mini program',
      enabled: true,
      integrationId: 'int-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(toMiniProgramAccount({
      id: 'acc-2',
      resource_account_kind: 'official_account',
      provider_code: 'wechat_official_account',
      provider_account_id: 'wx-oa',
      display_name: 'OA',
      enabled: 0,
    })).toBeUndefined()
    // Provider code alone also identifies a mini-program row.
    expect(toMiniProgramAccount({
      id: 'acc-3',
      provider_code: 'wechat_mini_program',
      provider_account_id: 'wx-3',
      display_name: 'Third',
      is_enabled: false,
    })).toMatchObject({ id: 'acc-3', appId: 'wx-3', displayName: 'Third', enabled: false })
  })

  it('falls back to the AppID for a missing name and skips rows without id or AppID', () => {
    expect(toMiniProgramAccount(row({ displayName: undefined }))).toMatchObject({ displayName: 'wx1234567890abcdef' })
    // A row with no enabled field defaults to enabled.
    expect(toMiniProgramAccount(row({ enabled: undefined }))).toMatchObject({ enabled: true })
    // Rows without an enabled column read their lifecycle from status.
    expect(toMiniProgramAccount(row({ enabled: undefined, status: 'active' }))).toMatchObject({ enabled: true })
    expect(toMiniProgramAccount(row({ enabled: undefined, status: 'inactive' }))).toMatchObject({ enabled: false })
    expect(toMiniProgramAccount(row({ enabled: undefined, status: 'suspended' }))).toMatchObject({ enabled: true })
    expect(toMiniProgramAccount(row({ id: undefined }))).toBeUndefined()
    expect(toMiniProgramAccount(row({ providerAccountId: undefined }))).toBeUndefined()
    expect(toMiniProgramAccount('not-a-row')).toBeUndefined()
    expect(toMiniProgramAccounts([row(), { id: 'x' }])).toHaveLength(1)
  })

  it('lists only mini-program accounts from one backend page', async () => {
    const api = makeBackend()
    api.resourceAccounts.list.mockResolvedValueOnce({ items: [row(), { id: 'oa', resourceAccountKind: 'official_account' }] })
    const accounts = await listMiniProgramAccounts(api.backend)
    expect(accounts).toHaveLength(1)
    expect(api.resourceAccounts.list).toHaveBeenCalledWith({ pageSize: 200 })
  })
})

describe('miniProgramApi create', () => {
  const draft = { appId: ' wx1234567890abcdef ', appSecret: ' secret ', displayName: ' My mini program ', enabled: true }

  it('creates the login integration and the account in one call', async () => {
    const api = makeBackend()
    const created = await createMiniProgramAccount(api.backend, draft)
    expect(api.integrations.create).toHaveBeenCalledWith({
      integrationCode: 'mini-program-wx1234567890abcdef',
      displayName: 'My mini program',
      providerCode: 'wechat_mini_program',
      providerClientId: 'wx1234567890abcdef',
      providerClientSecret: 'secret',
      redirectUri: '',
      surfaceKind: 'mini_program',
      enabled: true,
    })
    expect(api.resourceAccounts.create).toHaveBeenCalledWith({
      integrationId: 'int-new',
      providerCode: 'wechat_mini_program',
      resourceAccountCode: 'mini-wx1234567890abcdef',
      resourceAccountKind: 'mini_program',
      displayName: 'My mini program',
      providerAccountId: 'wx1234567890abcdef',
      accessMode: 'operator_managed',
      enabled: true,
    })
    expect(created).toMatchObject({ id: 'acc-new', appId: 'wx1234567890abcdef', displayName: 'My mini program' })
  })

  it('reuses an existing integration and follows the account enabled state', async () => {
    const api = makeBackend()
    api.integrations.list.mockResolvedValueOnce({
      items: [{ id: 'int-existing', providerCode: 'wechat_mini_program', providerClientId: 'wx1234567890abcdef' }],
    })
    await createMiniProgramAccount(api.backend, { ...draft, enabled: false })
    expect(api.integrations.create).not.toHaveBeenCalled()
    expect(api.integrations.update).toHaveBeenCalledWith('int-existing', { enabled: false })
    expect(api.resourceAccounts.create).toHaveBeenCalledWith(expect.objectContaining({ integrationId: 'int-existing' }))
  })

  it('refuses a second account for the same AppID', async () => {
    const api = makeBackend()
    api.integrations.list.mockResolvedValueOnce({
      items: [{ id: 'int-existing', providerCode: 'wechat_mini_program', providerClientId: 'wx1234567890abcdef' }],
    })
    api.resourceAccounts.list.mockResolvedValueOnce({ items: [row()] })
    await expect(createMiniProgramAccount(api.backend, draft)).rejects.toThrow(/already exists/)
    expect(api.resourceAccounts.create).not.toHaveBeenCalled()
  })

  it('fails loudly when the integration or created account carries no id', async () => {
    const api = makeBackend()
    api.integrations.create.mockResolvedValueOnce({} as never)
    await expect(createMiniProgramAccount(api.backend, draft)).rejects.toThrow(/integration carried no id/)

    const second = makeBackend()
    second.resourceAccounts.create.mockResolvedValueOnce({ resourceAccountKind: 'mini_program' } as never)
    await expect(createMiniProgramAccount(second.backend, draft)).rejects.toThrow(/account carried no id or AppID/)
  })
})

describe('miniProgramApi mutations', () => {
  const account = toMiniProgramAccount(row())!

  it('toggles the account and its login integration', async () => {
    const api = makeBackend()
    await setMiniProgramEnabled(api.backend, account, false)
    expect(api.resourceAccounts.update).toHaveBeenCalledWith('acc-1', { enabled: false })
    expect(api.integrations.update).toHaveBeenCalledWith('int-1', { enabled: false })

    const withoutIntegration = makeBackend()
    await setMiniProgramEnabled(withoutIntegration.backend, { ...account, integrationId: undefined }, true)
    expect(withoutIntegration.integrations.update).not.toHaveBeenCalled()
  })

  it('deletes the account row only', async () => {
    const api = makeBackend()
    await deleteMiniProgramAccount(api.backend, 'acc-1')
    expect(api.resourceAccounts.delete).toHaveBeenCalledWith('acc-1')
    expect(api.integrations.update).not.toHaveBeenCalled()
  })

  it('queues the backend login check', async () => {
    const api = makeBackend()
    await queueMiniProgramLoginCheck(api.backend, 'acc-1')
    expect(api.resourceAccounts.miniProgramLoginChecks.create).toHaveBeenCalledWith('acc-1', {})
  })

  it('updates the profile and only the supplied credentials', async () => {
    const api = makeBackend()
    await updateMiniProgramAccount(api.backend, account, {
      displayName: ' Renamed ',
      appId: ' wx-new ',
      appSecret: ' new-secret ',
    })
    expect(api.resourceAccounts.update).toHaveBeenCalledWith('acc-1', {
      displayName: 'Renamed',
      providerAccountId: 'wx-new',
      providerClientSecret: 'new-secret',
    })
    expect(api.integrations.update).toHaveBeenCalledWith('int-1', { displayName: 'Renamed' })

    const blank = makeBackend()
    await updateMiniProgramAccount(blank.backend, account, { displayName: 'Renamed', appId: '', appSecret: '' })
    expect(blank.resourceAccounts.update).toHaveBeenCalledWith('acc-1', { displayName: 'Renamed' })
  })

  it('skips the integration write when the account has none', async () => {
    const api = makeBackend()
    await updateMiniProgramAccount(api.backend, { ...account, integrationId: undefined }, { displayName: 'Renamed' })
    expect(api.integrations.update).not.toHaveBeenCalled()
  })
})
