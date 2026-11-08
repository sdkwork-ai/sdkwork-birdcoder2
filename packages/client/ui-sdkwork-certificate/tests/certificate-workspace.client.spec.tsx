// @vitest-environment jsdom
/**
 * Certificate workspace behaviour: the ledger, its status/validity rendering,
 * the issuance form over verified hostnames, and the renewal/deletion
 * commands. The generated client is a local double with the same call shapes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CertificateResponse, DomainHostnameResponse, DomainZoneResponse, PageInfo, SdkworkDeployAppClient,
} from '@sdkwork/deployments-app-sdk'
import { CertificateWorkspace } from '../src/client/CertificateWorkspace.tsx'
import { zh, type CertificateKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shipped Chinese copy with `{name}` interpolation. */
const t = ((key: CertificateKey, params?: Record<string, unknown>) => {
  const template = (zh as Record<string, string>)[key] ?? key
  return template.replace(/\{(\w+)\}/gu, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as Parameters<typeof CertificateWorkspace>[0]['t']

const PAGE_INFO: PageInfo = { mode: 'offset', page: 1, pageSize: 100, hasMore: false }

function page<T>(items: T[]) {
  return { items, pageInfo: PAGE_INFO }
}

function cert(overrides: Partial<CertificateResponse> = {}): CertificateResponse {
  return {
    id: 'cert-1',
    certName: 'example-com',
    certificateSource: 'MANAGED',
    caProfile: 'LETS_ENCRYPT_PRODUCTION',
    certificateScope: 'SINGLE_DOMAIN',
    validationMethod: 'AUTO',
    preferredKeyAlgorithm: 'RSA',
    identifiers: ['www.example.com'],
    notBefore: '2026-01-01T00:00:00.000Z',
    notAfter: '2026-03-01T00:00:00.000Z',
    autoRenew: true,
    renewalStatus: 'PLANNED',
    status: 'ACTIVE',
    renewBeforeDays: 30,
    daysUntilExpiry: 12,
    validityPhase: 'VALID',
    renewalFailureCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

function zone(overrides: Partial<DomainZoneResponse> = {}): DomainZoneResponse {
  return {
    id: 'zone-1',
    apexHostname: 'example.com',
    scope: 'USER',
    status: 'ACTIVE',
    hostnameCount: '1',
    verifiedHostnameCount: '1',
    certificateCount: '0',
    bindingCount: '0',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

function hostname(overrides: Partial<DomainHostnameResponse> = {}): DomainHostnameResponse {
  return {
    id: 'host-1',
    zoneId: 'zone-1',
    hostname: 'www.example.com',
    relativeName: 'www',
    hostnameType: 'EXACT',
    verificationStatus: 'VERIFIED',
    status: 'ACTIVE',
    certificateCount: '0',
    bindingCount: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

function makeClient() {
  const certificates = {
    list: vi.fn(async () => page([cert()])),
    create: vi.fn(async () => cert()),
    renew: vi.fn(async () => cert()),
    delete: vi.fn(async () => undefined),
  }
  const zones = { list: vi.fn(async () => page([zone()])) }
  const hostnames = { list: vi.fn(async (_zoneId: string) => page([hostname()])) }
  const client = {
    certificate: certificates,
    domain: { domainZones: { ...zones, hostnames } },
  } as unknown as SdkworkDeployAppClient
  return { client, certificates, zones, hostnames }
}

/** Open the issuance form and wait for its hostname options. */
async function openForm(api: ReturnType<typeof makeClient>): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '申请证书' }))
  await waitFor(() => { expect(api.zones.list).toHaveBeenCalled() })
}

describe('CertificateWorkspace ledger', () => {
  it('closes the issuance drawer from its close control', async () => {
    const api = makeClient()
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    await openForm(api)
    expect(screen.getByRole('dialog', { name: '申请证书' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByLabelText('证书名称')).toBeNull()
  })

  it('shows loading and then the ledger rows', async () => {
    const api = makeClient()
    let release: (() => void) | undefined
    api.certificates.list.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => { resolve(page([cert()])) }
    }))
    render(<CertificateWorkspace client={api.client} t={t} />)
    expect(screen.getByText('正在加载…')).toBeTruthy()
    await act(async () => { release!() })
    expect(await screen.findByText('example-com')).toBeTruthy()
    expect(screen.getByText('托管申请')).toBeTruthy()
    expect(screen.getByText('单域名')).toBeTruthy()
    expect(screen.getByText('www.example.com')).toBeTruthy()
    expect(screen.getByText('已生效')).toBeTruthy()
    expect(screen.getByText('2026-03-01 00:00')).toBeTruthy()
    expect(screen.getByText('剩余 12 天')).toBeTruthy()
    expect(screen.getByText('已开启')).toBeTruthy()
  })

  it('renders every certificate status, source, scope, and expiry variant', async () => {
    const api = makeClient()
    api.certificates.list.mockResolvedValue(page([
      cert({ id: 'c1', certName: 'pending', status: 'PENDING' }),
      cert({ id: 'c2', certName: 'issuing', status: 'ISSUING' }),
      cert({ id: 'c3', certName: 'expired', status: 'EXPIRED', daysUntilExpiry: -2 }),
      cert({ id: 'c4', certName: 'failed', status: 'FAILED' }),
      cert({ id: 'c5', certName: 'revoked', status: 'REVOKED' }),
      cert({
        id: 'c6',
        certName: 'custom',
        certificateSource: 'CUSTOM',
        certificateScope: 'WILDCARD',
        autoRenew: false,
        notAfter: undefined,
        daysUntilExpiry: undefined,
        identifiers: [],
      }),
    ]))
    render(<CertificateWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('pending')).toBeTruthy()
    expect(screen.getByText('待签发')).toBeTruthy()
    expect(screen.getByText('签发中')).toBeTruthy()
    expect(screen.getAllByText('已过期').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('签发失败')).toBeTruthy()
    expect(screen.getByText('已撤销')).toBeTruthy()
    expect(screen.getByText('自定义上传')).toBeTruthy()
    expect(screen.getByText('泛域名')).toBeTruthy()
    expect(screen.getByText('未开启')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('renders an empty ledger', async () => {
    const api = makeClient()
    api.certificates.list.mockResolvedValue(page([]))
    render(<CertificateWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('还没有证书，先为已完成归属验证的域名申请一张。')).toBeTruthy()
  })

  it('reports a failed ledger read with a retry that recovers', async () => {
    const api = makeClient()
    api.certificates.list.mockRejectedValueOnce(new Error('ledger exploded'))
    render(<CertificateWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('ledger exploded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('example-com')).toBeTruthy()
  })

  it('falls back to the load copy when a rejection carries no message', async () => {
    const api = makeClient()
    api.certificates.list.mockRejectedValueOnce({})
    render(<CertificateWorkspace client={api.client} t={t} />)
    expect(await screen.findByText('加载失败')).toBeTruthy()
  })
})

describe('CertificateWorkspace issuance form', () => {
  it('lists only verified hostnames, grouped by root domain, and shows a loading state', async () => {
    const api = makeClient()
    api.zones.list.mockResolvedValue(page([zone(), zone({ id: 'zone-2', apexHostname: 'example.org' })]))
    api.hostnames.list.mockImplementation(async (zoneId: string) => page(zoneId === 'zone-1'
      ? [
        hostname(),
        hostname({ id: 'host-2', hostname: 'api.example.com', relativeName: 'api' }),
        hostname({ id: 'pending', hostname: 'draft.example.com', verificationStatus: 'PENDING' }),
      ]
      : [hostname({ id: 'wild', zoneId: 'zone-2', hostname: '*.example.org', hostnameType: 'WILDCARD' })]))
    let release: (() => void) | undefined
    api.zones.list.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => { resolve(page([zone(), zone({ id: 'zone-2', apexHostname: 'example.org' })])) }
    }))
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    fireEvent.click(screen.getByRole('button', { name: '申请证书' }))
    expect(await screen.findByText('正在加载…')).toBeTruthy()
    await act(async () => { release!() })
    expect(await screen.findByText('example.com')).toBeTruthy()
    expect(screen.getByText('example.org')).toBeTruthy()
    expect(screen.getByLabelText('www.example.com')).toBeTruthy()
    expect(screen.getByLabelText('api.example.com')).toBeTruthy()
    expect(screen.getByLabelText('*.example.org')).toBeTruthy()
    expect(screen.queryByLabelText('draft.example.com')).toBeNull()
  })

  it('explains when the hostname list cannot be read, and when none is verified', async () => {
    const api = makeClient()
    api.hostnames.list.mockRejectedValueOnce(new Error('hostnames down'))
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    await openForm(api)
    expect(await screen.findByText('无法读取可签发域名，请稍后重试。')).toBeTruthy()
    cleanup()

    const second = makeClient()
    second.hostnames.list.mockResolvedValue(page([hostname({ verificationStatus: 'PENDING' })]))
    render(<CertificateWorkspace client={second.client} t={t} />)
    await screen.findByText('example-com')
    await openForm(second)
    expect(await screen.findByText('还没有已完成归属验证的域名，请先在域名管理中验证域名。')).toBeTruthy()
  })

  it('validates the form and issues a single-domain certificate', async () => {
    const api = makeClient()
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    await openForm(api)
    expect(await screen.findByLabelText('www.example.com')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '申请' }))
    expect(screen.getByText('请填写证书名称')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('证书名称'), { target: { value: 'example-com' } })
    fireEvent.click(screen.getByRole('button', { name: '申请' }))
    expect(screen.getByText('请至少选择一个域名')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('www.example.com'))
    fireEvent.change(screen.getByLabelText('证书类型'), { target: { value: 'WILDCARD' } })
    fireEvent.click(screen.getByRole('button', { name: '申请' }))
    expect(screen.getByText('泛域名证书至少需要一个泛域名')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('证书类型'), { target: { value: 'SINGLE_DOMAIN' } })
    // Toggling the same hostname twice covers the deselect path, then the
    // selection is restored for the successful submission.
    fireEvent.click(screen.getByLabelText('www.example.com'))
    fireEvent.click(screen.getByLabelText('www.example.com'))
    fireEvent.click(screen.getByRole('button', { name: '申请' }))
    await waitFor(() => { expect(api.certificates.create).toHaveBeenCalledTimes(1) })
    expect(api.certificates.create).toHaveBeenCalledWith(
      {
        certName: 'example-com',
        domainIds: ['host-1'],
        certificateScope: 'SINGLE_DOMAIN',
        autoRenew: true,
      },
      { idempotencyKey: expect.any(String) as string },
    )
    await waitFor(() => { expect(screen.queryByLabelText('证书名称')).toBeNull() })
  })

  it('issues a wildcard certificate with auto-renew off', async () => {
    const api = makeClient()
    api.hostnames.list.mockResolvedValue(page([
      hostname({ id: 'wild', hostname: '*.example.com', hostnameType: 'WILDCARD' }),
    ]))
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    await openForm(api)
    fireEvent.change(screen.getByLabelText('证书名称'), { target: { value: 'wildcard' } })
    fireEvent.change(screen.getByLabelText('证书类型'), { target: { value: 'WILDCARD' } })
    fireEvent.click(screen.getByLabelText('*.example.com'))
    fireEvent.click(screen.getByLabelText('自动续期'))
    fireEvent.click(screen.getByRole('button', { name: '申请' }))
    await waitFor(() => { expect(api.certificates.create).toHaveBeenCalledTimes(1) })
    expect(api.certificates.create).toHaveBeenCalledWith(
      {
        certName: 'wildcard',
        domainIds: ['wild'],
        certificateScope: 'WILDCARD',
        autoRenew: false,
      },
      { idempotencyKey: expect.any(String) as string },
    )
  })

  it('rejects a wildcard hostname under a single-domain scope', async () => {
    const api = makeClient()
    api.hostnames.list.mockResolvedValue(page([
      hostname({ id: 'wild', hostname: '*.example.com', hostnameType: 'WILDCARD' }),
    ]))
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    await openForm(api)
    fireEvent.change(screen.getByLabelText('证书名称'), { target: { value: 'exact' } })
    fireEvent.click(screen.getByLabelText('*.example.com'))
    fireEvent.click(screen.getByRole('button', { name: '申请' }))
    expect(screen.getByText('单域名证书只能包含普通域名')).toBeTruthy()
    expect(api.certificates.create).not.toHaveBeenCalled()
  })

  it('keeps a failed issuance visible and lets the form be cancelled', async () => {
    const api = makeClient()
    api.certificates.create.mockRejectedValueOnce(new Error('issuance denied'))
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    await openForm(api)
    fireEvent.change(screen.getByLabelText('证书名称'), { target: { value: 'example-com' } })
    fireEvent.click(screen.getByLabelText('www.example.com'))
    fireEvent.click(screen.getByRole('button', { name: '申请' }))
    expect(await screen.findByText('issuance denied')).toBeTruthy()
    expect(screen.getByLabelText('证书名称')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('证书名称')).toBeNull()
  })
})

describe('CertificateWorkspace commands', () => {
  it('renews a certificate through the manual command', async () => {
    const api = makeClient()
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    fireEvent.click(screen.getByRole('button', { name: '续期' }))
    await waitFor(() => { expect(api.certificates.renew).toHaveBeenCalledWith('cert-1', { idempotencyKey: expect.any(String) as string }) })
  })

  it('reports a failed renewal', async () => {
    const api = makeClient()
    api.certificates.renew.mockRejectedValueOnce(new Error('renew denied'))
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    fireEvent.click(screen.getByRole('button', { name: '续期' }))
    expect(await screen.findByText('renew denied')).toBeTruthy()
  })

  it('deletes only after the inline confirmation and keeps the row on failure', async () => {
    const api = makeClient()
    api.certificates.delete.mockRejectedValueOnce(new Error('delete denied'))
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(api.certificates.delete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(api.certificates.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(await screen.findByText('delete denied')).toBeTruthy()
    expect(screen.getByText('example-com')).toBeTruthy()
    // The confirmation stays open after the failure; cancel it, then retry.
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => { expect(api.certificates.delete).toHaveBeenCalledTimes(2) })
  })

  it('refreshes the ledger from the toolbar', async () => {
    const api = makeClient()
    render(<CertificateWorkspace client={api.client} t={t} />)
    await screen.findByText('example-com')
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => { expect(api.certificates.list).toHaveBeenCalledTimes(2) })
  })
})
