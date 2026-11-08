// @vitest-environment jsdom
/**
 * Domain workspace behaviour: the root-domain ledger, zone creation, status
 * toggling, deletion, and the zone detail's hostname/DNS-record operations.
 * The generated client is a local double with the same call shapes.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DomainDnsRecordResponse, DomainHostnameResponse, DomainZoneResponse, SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import { DnsWorkspace } from '../src/client/DnsWorkspace.tsx'
import { ZoneDetail } from '../src/client/ZoneDetail.tsx'
import { zh, type DnsKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: DnsKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as Parameters<typeof DnsWorkspace>[0]['t']

const PAGE_INFO = { mode: 'offset' as const, page: 1, pageSize: 100, hasMore: false }

function page<T>(items: T[]) {
  return { items, pageInfo: PAGE_INFO }
}

function zoneRow(overrides: Partial<DomainZoneResponse> = {}): DomainZoneResponse {
  return {
    id: 'zone-1',
    apexHostname: 'example.com',
    scope: 'USER',
    dnsProvider: 'ALIYUN_DNS',
    status: 'ACTIVE',
    hostnameCount: '1',
    verifiedHostnameCount: '1',
    certificateCount: '0',
    bindingCount: '0',
    updatedAt: '2026-01-02T03:04:05.000Z',
    version: '1',
    ...overrides,
  }
}

function hostnameRow(overrides: Partial<DomainHostnameResponse> = {}): DomainHostnameResponse {
  return {
    id: 'host-1',
    zoneId: 'zone-1',
    hostname: 'www.example.com',
    relativeName: 'www',
    hostnameType: 'EXACT',
    verificationStatus: 'PENDING',
    status: 'ACTIVE',
    certificateCount: '0',
    bindingCount: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

function recordRow(overrides: Partial<DomainDnsRecordResponse> = {}): DomainDnsRecordResponse {
  return {
    id: 'record-1',
    recordName: 'www.example.com',
    host: 'www',
    recordType: 'A',
    recordValue: '192.0.2.10',
    ttlSeconds: 600,
    recordStatus: 'ENABLED',
    dnsProvider: 'ALIYUN_DNS',
    providerAccountId: 'account-1',
    syncedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function makeClient() {
  const zones = {
    list: vi.fn(async () => page([zoneRow()])),
    create: vi.fn(async () => zoneRow()),
    update: vi.fn(async () => zoneRow({ status: 'PAUSED' })),
    delete: vi.fn(async () => undefined),
  }
  const hostnames = {
    list: vi.fn(async () => page([hostnameRow()])),
    create: vi.fn(async () => hostnameRow()),
    verify: vi.fn(async () => ({
      verified: false,
      method: 'DNS_TXT' as const,
      recordName: '_sdkwork-verification.example.com',
      token: 'proof-token',
      expiresAt: '2026-02-01T00:00:00.000Z',
    })),
    delete: vi.fn(async () => undefined),
  }
  const records = {
    sync: vi.fn(async () => ({
      recordCount: '3',
      syncedAt: '2026-01-02T00:00:00.000Z',
      zoneApex: 'example.com',
      dnsProvider: 'ALIYUN_DNS',
      providerAccountId: 'account-1',
    })),
    list: vi.fn(async () => page([recordRow()])),
    create: vi.fn(async () => recordRow()),
    delete: vi.fn(async () => undefined),
    status: { update: vi.fn(async () => recordRow({ recordStatus: 'DISABLED' })) },
  }
  const cloudAccounts = { list: vi.fn(async () => page([])) }
  const client = {
    domain: {
      domainZones: { ...zones, hostnames, dnsRecords: records },
      cloudAccounts,
    },
  } as unknown as SdkworkDeployAppClient
  return { client, zones, hostnames, records, cloudAccounts }
}

describe('DnsWorkspace', () => {
  it('lists root domains with provider, status, and counters', async () => {
    const api = makeClient()
    api.zones.list.mockResolvedValueOnce(page([
      zoneRow(),
      zoneRow({ id: 'zone-2', apexHostname: 'example.org', dnsProvider: undefined, displayName: 'Org' }),
    ]))
    render(<DnsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('example.com')).toBeTruthy()
    expect(screen.getByText('ALIYUN_DNS')).toBeTruthy()
    expect(screen.getByText('Org')).toBeTruthy()
    expect(screen.getAllByText('2026-01-02 03:04').length).toBeGreaterThanOrEqual(1)
    // The undefined-provider row renders the neutral placeholder.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('shows a failed list with a retry that recovers', async () => {
    const api = makeClient()
    api.zones.list.mockRejectedValueOnce(new Error('zone list exploded'))
    render(<DnsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('zone list exploded')).toBeTruthy()
    fireEvent.click(screen.getByText('重试'))
    expect(await screen.findByText('example.com')).toBeTruthy()
    expect(screen.queryByText('zone list exploded')).toBeNull()
  })

  it('falls back to the load copy when a rejection carries no message', async () => {
    const api = makeClient()
    api.zones.list.mockRejectedValueOnce({})
    render(<DnsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('加载失败')).toBeTruthy()
  })

  it('creates a zone after validating the apex, including optional fields', async () => {
    const api = makeClient()
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '添加根域名' }))
    await waitFor(() => { expect(api.cloudAccounts.list).toHaveBeenCalled() })

    const apex = screen.getByLabelText('根域名') as HTMLInputElement
    fireEvent.change(apex, { target: { value: 'localhost' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(screen.getByText('请输入可注册的根域名，如 example.com')).toBeTruthy()
    expect(api.zones.create).not.toHaveBeenCalled()

    fireEvent.change(apex, { target: { value: 'example.org' } })
    fireEvent.change(screen.getByLabelText('备注名称（可选）'), { target: { value: 'Org' } })
    fireEvent.change(screen.getByLabelText('DNS 服务商（可选）'), { target: { value: 'DNSPOD' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => { expect(api.zones.create).toHaveBeenCalledTimes(1) })
    expect(api.zones.create).toHaveBeenCalledWith(
      { apexHostname: 'example.org', displayName: 'Org', dnsProvider: 'DNSPOD' },
      { idempotencyKey: expect.any(String) as string },
    )
    await waitFor(() => { expect(screen.queryByLabelText('根域名')).toBeNull() })
  })

  it('keeps a failed zone creation visible and preserves the form', async () => {
    const api = makeClient()
    api.zones.create.mockRejectedValueOnce(new Error('domain already exists'))
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '添加根域名' }))
    fireEvent.change(screen.getByLabelText('根域名'), { target: { value: 'example.org' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(await screen.findByText('domain already exists')).toBeTruthy()
    expect(screen.getByLabelText('根域名')).toBeTruthy()
    // Cancel clears the draft and closes the form.
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('根域名')).toBeNull()
  })

  it('closes the root-domain drawer from its close control', async () => {
    const api = makeClient()
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '添加根域名' }))
    expect(screen.getByRole('dialog', { name: '新增根域名' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByLabelText('根域名')).toBeNull()
  })

  it('pauses a zone and deletes one only after the inline confirmation', async () => {
    const api = makeClient()
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    await waitFor(() => { expect(api.zones.update).toHaveBeenCalledWith('zone-1', { status: 'PAUSED' }) })

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(api.zones.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(api.zones.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => { expect(api.zones.delete).toHaveBeenCalledWith('zone-1') })
  })

  it('reports a failed action with its wire message and clears the banner', async () => {
    const api = makeClient()
    api.zones.update.mockRejectedValueOnce(new Error('zone is locked'))
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(await screen.findByText('zone is locked')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.queryByText('zone is locked')).toBeNull()
  })

  it('opens the zone detail and returns to a refreshed list', async () => {
    const api = makeClient()
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    expect(await screen.findByRole('button', { name: '返回根域名' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回根域名' }))
    expect(await screen.findByRole('button', { name: '添加根域名' })).toBeTruthy()
    expect(api.zones.list.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('resumes a paused zone, shows a missing timestamp, and opens the detail from the apex link', async () => {
    const api = makeClient()
    api.zones.list.mockResolvedValue(page([
      zoneRow({ status: 'PAUSED', dnsProvider: '', updatedAt: '' }),
    ]))
    render(<DnsWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('已暂停')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: '启用' }))
    await waitFor(() => { expect(api.zones.update).toHaveBeenCalledWith('zone-1', { status: 'ACTIVE' }) })
    fireEvent.click(screen.getByRole('button', { name: 'example.com' }))
    expect(await screen.findByRole('button', { name: '返回根域名' })).toBeTruthy()
  })

  it('keeps the account picker optional when the cloud-account list fails', async () => {
    const api = makeClient()
    api.cloudAccounts.list.mockRejectedValueOnce(new Error('account center down'))
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '添加根域名' }))
    await waitFor(() => { expect(api.cloudAccounts.list).toHaveBeenCalled() })
    const accountSelect = screen.getByLabelText('云账号（可选）') as HTMLSelectElement
    expect(accountSelect.options).toHaveLength(1)
    expect(accountSelect.options[0]?.textContent).toBe('不绑定云账号')
  })

  it('submits a pinned cloud account with the new zone', async () => {
    const api = makeClient()
    api.cloudAccounts.list.mockResolvedValue(page([
      { id: 'account-1', accountCode: 'a1', displayName: 'Aliyun Main', vendorCode: 'aliyun', scopeType: 'user', tenantGlobal: false, isDefault: true, status: 'active', credentialConfigured: true },
    ]) as never)
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '添加根域名' }))
    await waitFor(() => { expect(api.cloudAccounts.list).toHaveBeenCalled() })
    fireEvent.change(screen.getByLabelText('根域名'), { target: { value: 'example.net' } })
    fireEvent.change(screen.getByLabelText('云账号（可选）'), { target: { value: 'account-1' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => { expect(api.zones.create).toHaveBeenCalledWith(
      { apexHostname: 'example.net', providerAccountId: 'account-1' },
      { idempotencyKey: expect.any(String) as string },
    ) })
  })

  it('reports a failed zone deletion and keeps the row', async () => {
    const api = makeClient()
    api.zones.delete.mockRejectedValueOnce(new Error('zone has hostnames'))
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(await screen.findByText('zone has hostnames')).toBeTruthy()
    expect(screen.getByText('example.com')).toBeTruthy()
  })

  it('reflects a zone status change made inside the detail', async () => {
    const api = makeClient()
    api.zones.update.mockResolvedValue(zoneRow({ status: 'PAUSED' }))
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(await screen.findByRole('button', { name: '启用' })).toBeTruthy()
  })
})

describe('ZoneDetail', () => {
  it('renders the zone header, hostname ledger, and status control', async () => {
    const api = makeClient()
    const onZoneChanged = vi.fn()
    render(
      <ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={onZoneChanged} />,
    )
    expect(await screen.findByText('www.example.com')).toBeTruthy()
    expect(screen.getByText('待验证')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    await waitFor(() => { expect(api.zones.update).toHaveBeenCalledWith('zone-1', { status: 'PAUSED' }) })
    expect(onZoneChanged).toHaveBeenCalled()
  })

  it('verifies a hostname and shows the TXT instruction, then the verified state', async () => {
    const api = makeClient()
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('button', { name: '验证' }))
    expect(await screen.findByText(/_sdkwork-verification\.example\.com/)).toBeTruthy()
    expect(screen.getByText(/proof-token/)).toBeTruthy()

    api.hostnames.verify.mockResolvedValueOnce({ verified: true, method: 'DNS_TXT' } as never)
    fireEvent.click(screen.getByRole('button', { name: '验证' }))
    expect(await screen.findByText('归属验证已通过')).toBeTruthy()
  })

  it('validates and creates a subdomain, then deletes one after confirmation', async () => {
    const api = makeClient()
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')

    fireEvent.click(screen.getByRole('button', { name: '添加子域名' }))
    fireEvent.change(screen.getByLabelText('子域名'), { target: { value: '@' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByText('请输入合法的子域名前缀，如 www 或 *')).toBeTruthy()
    expect(api.hostnames.create).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('子域名'), { target: { value: 'api' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => { expect(api.hostnames.create).toHaveBeenCalledTimes(1) })
    expect(api.hostnames.create).toHaveBeenCalledWith(
      'zone-1',
      { relativeName: 'api' },
      { idempotencyKey: expect.any(String) as string },
    )

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => { expect(api.hostnames.delete).toHaveBeenCalledWith('zone-1', 'host-1') })
  })

  it('switches to DNS records, syncs, toggles, and deletes them', async () => {
    const api = makeClient()
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    expect(await screen.findByText('192.0.2.10')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '从云账号同步' }))
    expect(await screen.findByText('已同步 3 条解析记录')).toBeTruthy()
    expect(api.records.sync).toHaveBeenCalledWith('zone-1', { idempotencyKey: expect.any(String) as string })

    fireEvent.click(screen.getByRole('button', { name: '暂停解析' }))
    await waitFor(() => {
      expect(api.records.status.update).toHaveBeenCalledWith(
        'zone-1',
        'record-1',
        { enabled: false },
        { idempotencyKey: expect.any(String) as string },
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => {
      expect(api.records.delete).toHaveBeenCalledWith('zone-1', 'record-1', { idempotencyKey: expect.any(String) as string })
    })
  })

  it('validates the record form field by field and submits a complete MX record', async () => {
    const api = makeClient()
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    await screen.findByText('192.0.2.10')
    fireEvent.click(screen.getByRole('button', { name: '添加解析记录' }))

    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByText('请输入合法的主机记录，如 www 或 @')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('主机记录'), { target: { value: 'mail' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByText('请填写记录值')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('记录值'), { target: { value: 'mail.example.com' } })
    fireEvent.change(screen.getByLabelText('TTL（秒）'), { target: { value: '12.5' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByText('TTL 需为 60–604800 之间的整数秒')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('TTL（秒）'), { target: { value: '600' } })
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'MX' } })
    fireEvent.change(screen.getByLabelText('优先级'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByText('请输入大于等于 0 的整数优先级')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('优先级'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => { expect(api.records.create).toHaveBeenCalledTimes(1) })
    expect(api.records.create).toHaveBeenCalledWith(
      'zone-1',
      { recordType: 'MX', host: 'mail', recordValue: 'mail.example.com', ttlSeconds: 600, priority: 10 },
      { idempotencyKey: expect.any(String) as string },
    )
  })

  it('shows empty states for a zone with no hostnames and no records', async () => {
    const api = makeClient()
    api.hostnames.list.mockResolvedValue(page([]))
    api.records.list.mockResolvedValue(page([]))
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    expect(await screen.findByText('该根域名下还没有子域名。')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    expect(await screen.findByText('还没有解析记录，可从云账号同步或手动添加。')).toBeTruthy()
  })

  it('surfaces a failed tab load and dismisses it', async () => {
    const api = makeClient()
    api.records.list.mockRejectedValueOnce(new Error('record ledger unavailable'))
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    expect(await screen.findByText('record ledger unavailable')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByText('record ledger unavailable')).toBeNull()
  })

  it('surfaces a failed hostname load and a message-less action failure', async () => {
    const api = makeClient()
    api.hostnames.list.mockRejectedValueOnce(new Error('hostname ledger down'))
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    expect(await screen.findByText('hostname ledger down')).toBeTruthy()
    // A rejection without a message reads as the generic action copy.
    api.hostnames.create.mockRejectedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: '添加子域名' }))
    fireEvent.change(screen.getByLabelText('子域名'), { target: { value: 'api' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(await screen.findByText('操作失败，请稍后重试。')).toBeTruthy()
  })

  it('renders every hostname verification state and hides verification for verified names', async () => {
    const api = makeClient()
    api.hostnames.list.mockResolvedValue(page([
      hostnameRow({ id: 'h1', hostname: '*.example.com', hostnameType: 'WILDCARD', verificationStatus: 'VERIFIED' }),
      hostnameRow({ id: 'h2', hostname: 'bad.example.com', verificationStatus: 'FAILED' }),
      hostnameRow({ id: 'h3', hostname: 'old.example.com', verificationStatus: 'EXPIRED' }),
    ]))
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    expect(await screen.findByText('*.example.com')).toBeTruthy()
    expect(screen.getByText('泛域名')).toBeTruthy()
    expect(screen.getByText('已验证')).toBeTruthy()
    expect(screen.getByText('验证失败')).toBeTruthy()
    expect(screen.getByText('已过期')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '验证' })).toHaveLength(2)

    // A verification attempt without a record name, proof, or expiry falls back
    // to the hostname itself and omits the expiry line.
    api.hostnames.verify.mockResolvedValueOnce({ verified: false, method: 'DNS_TXT' } as never)
    fireEvent.click(screen.getAllByRole('button', { name: '验证' })[0])
    expect(await screen.findByText(/bad\.example\.com →/)).toBeTruthy()
    expect(screen.queryByText(/验证尝试有效期至/)).toBeNull()
  })

  it('cancels both inline forms and both delete confirmations', async () => {
    const api = makeClient()
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('button', { name: '添加子域名' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('子域名')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(api.hostnames.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    await screen.findByText('192.0.2.10')
    fireEvent.click(screen.getByRole('button', { name: '添加解析记录' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('主机记录')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(api.records.delete).not.toHaveBeenCalled()
  })

  it('renders a disabled record without a TTL and resumes it', async () => {
    const api = makeClient()
    api.records.list.mockResolvedValue(page([
      recordRow({ recordStatus: 'DISABLED', ttlSeconds: undefined }),
    ]))
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    expect(await screen.findByText('已暂停')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByRole('button', { name: '恢复解析' }))
    await waitFor(() => {
      expect(api.records.status.update).toHaveBeenCalledWith(
        'zone-1',
        'record-1',
        { enabled: true },
        { idempotencyKey: expect.any(String) as string },
      )
    })
  })

  it('submits a plain record without optional fields and a wildcard MX without priority', async () => {
    const api = makeClient()
    api.records.list.mockResolvedValue(page([]))
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    await screen.findByText('还没有解析记录，可从云账号同步或手动添加。')

    fireEvent.click(screen.getByRole('button', { name: '添加解析记录' }))
    fireEvent.change(screen.getByLabelText('主机记录'), { target: { value: 'www' } })
    fireEvent.change(screen.getByLabelText('记录值'), { target: { value: '192.0.2.20' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => { expect(api.records.create).toHaveBeenCalledTimes(1) })
    expect(api.records.create).toHaveBeenLastCalledWith(
      'zone-1',
      { recordType: 'A', host: 'www', recordValue: '192.0.2.20' },
      { idempotencyKey: expect.any(String) as string },
    )

    fireEvent.click(screen.getByRole('button', { name: '添加解析记录' }))
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'MX' } })
    fireEvent.change(screen.getByLabelText('主机记录'), { target: { value: '@' } })
    fireEvent.change(screen.getByLabelText('记录值'), { target: { value: 'mail.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => { expect(api.records.create).toHaveBeenCalledTimes(2) })
    expect(api.records.create).toHaveBeenLastCalledWith(
      'zone-1',
      { recordType: 'MX', host: '@', recordValue: 'mail.example.com' },
      { idempotencyKey: expect.any(String) as string },
    )
  })

  it('resumes a paused zone and switches back to the hostname tab', async () => {
    const api = makeClient()
    api.zones.update.mockResolvedValue(zoneRow({ status: 'ACTIVE' }))
    render(<ZoneDetail client={api.client} zone={zoneRow({ status: 'PAUSED' })} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    await screen.findByText('192.0.2.10')
    fireEvent.click(screen.getByRole('tab', { name: '子域名' }))
    expect(await screen.findByText('www.example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '启用' }))
    await waitFor(() => { expect(api.zones.update).toHaveBeenCalledWith('zone-1', { status: 'ACTIVE' }) })
  })

  it('reports every failed detail command', async () => {
    const api = makeClient()
    api.zones.update.mockRejectedValueOnce(new Error('zone update denied'))
    api.hostnames.verify.mockRejectedValueOnce(new Error('verify denied'))
    api.hostnames.delete.mockRejectedValueOnce(new Error('hostname delete denied'))
    api.records.sync.mockRejectedValueOnce(new Error('sync denied'))
    api.records.create.mockRejectedValueOnce(new Error('record create denied'))
    api.records.status.update.mockRejectedValueOnce(new Error('record toggle denied'))
    api.records.delete.mockRejectedValueOnce(new Error('record delete denied'))
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')
    /** Dismiss the top banner (or close a pending confirmation) — the banner carries the first 取消. */
    const dismiss = (): void => {
      fireEvent.click(screen.getAllByRole('button', { name: '取消' })[0])
    }

    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    expect(await screen.findByText('zone update denied')).toBeTruthy()
    dismiss()

    fireEvent.click(screen.getByRole('button', { name: '验证' }))
    expect(await screen.findByText('verify denied')).toBeTruthy()
    dismiss()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(await screen.findByText('hostname delete denied')).toBeTruthy()
    dismiss()

    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    await screen.findByText('192.0.2.10')
    fireEvent.click(screen.getByRole('button', { name: '从云账号同步' }))
    expect(await screen.findByText('sync denied')).toBeTruthy()
    dismiss()

    fireEvent.click(screen.getByRole('button', { name: '添加解析记录' }))
    fireEvent.change(screen.getByLabelText('主机记录'), { target: { value: 'www' } })
    fireEvent.change(screen.getByLabelText('记录值'), { target: { value: '192.0.2.30' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(await screen.findByText('record create denied')).toBeTruthy()
    dismiss()

    fireEvent.click(screen.getByRole('button', { name: '暂停解析' }))
    expect(await screen.findByText('record toggle denied')).toBeTruthy()
    dismiss()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(await screen.findByText('record delete denied')).toBeTruthy()
    dismiss()
  })

  it('closes the hostname and record drawers from their close controls', async () => {
    const api = makeClient()
    render(<ZoneDetail client={api.client} zone={zoneRow()} t={t} onBack={() => {}} onZoneChanged={() => {}} />)
    await screen.findByText('www.example.com')

    fireEvent.click(screen.getByRole('button', { name: '添加子域名' }))
    expect(screen.getByRole('dialog', { name: '添加子域名' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByLabelText('子域名')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'DNS 解析' }))
    await screen.findByText('192.0.2.10')
    fireEvent.click(screen.getByRole('button', { name: '添加解析记录' }))
    expect(screen.getByRole('dialog', { name: '添加解析记录' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByLabelText('主机记录')).toBeNull()
  })
})
