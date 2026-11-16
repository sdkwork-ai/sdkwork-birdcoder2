// @vitest-environment jsdom
/**
 * Verification-file surface inside the domain dialog: the entry points (zone
 * row, zone header, subdomain row), the upload path (file picker and manual
 * entry), the self-check verdicts, deletion, and every failure shape.
 *
 * The generated client is a local double with the same call shapes; the file
 * objects come from jsdom, whose `File.text()` the picker reads. Queries are
 * scoped to the drawer because the zone ledger behind it carries its own
 * create/delete controls.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DomainVerificationFileResponse, DomainZoneResponse, SdkworkDeployAppClient,
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
    hostnameCount: '2',
    verifiedHostnameCount: '1',
    certificateCount: '0',
    bindingCount: '0',
    updatedAt: '2026-01-02T03:04:05.000Z',
    version: '1',
    ...overrides,
  }
}

function fileRow(overrides: Partial<DomainVerificationFileResponse> = {}): DomainVerificationFileResponse {
  return {
    id: 'file-1',
    zoneId: 'zone-1',
    platform: 'WECHAT_OFFICIAL_ACCOUNT',
    fileName: 'MP_verify_abc.txt',
    content: 'wechat-token',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function hostnameRow() {
  return {
    id: 'host-1',
    zoneId: 'zone-1',
    hostname: 'www.example.com',
    relativeName: 'www',
    hostnameType: 'EXACT' as const,
    verificationStatus: 'PENDING' as const,
    status: 'ACTIVE' as const,
    certificateCount: '0',
    bindingCount: '0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    version: '1',
  }
}

function makeClient() {
  const zones = { list: vi.fn(async () => page([zoneRow()])) }
  const hostnames = { list: vi.fn(async () => page([hostnameRow()])) }
  const verificationFiles = {
    list: vi.fn(async () => page([fileRow()])),
    create: vi.fn(async () => fileRow()),
    delete: vi.fn(async () => undefined),
    check: vi.fn(async () => ({
      matched: true,
      reachable: true,
      statusCode: 200,
      scheme: 'https',
      checkedAt: '2026-01-02T00:00:00.000Z',
    })),
  }
  const client = {
    domain: { domainZones: { ...zones, hostnames, verificationFiles } },
  } as unknown as SdkworkDeployAppClient
  return { client, zones, hostnames, verificationFiles }
}

/** Open the zone row's verification drawer and hand back its dialog. */
async function openDrawer(api: ReturnType<typeof makeClient>): Promise<HTMLElement> {
  render(<DnsWorkspace client={api.client} t={t} />)
  await screen.findByText('example.com')
  fireEvent.click(screen.getByRole('button', { name: '校验文件' }))
  return await screen.findByRole('dialog', { name: '域名归属校验文件' })
}

/** Build a picked-file object jsdom exposes through an input change. */
function pickedFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' })
}

describe('verification files · entry points', () => {
  it('opens the zone-scoped drawer from the zone row and lists its files', async () => {
    const api = makeClient()
    api.verificationFiles.list.mockResolvedValueOnce(page([
      fileRow(),
      fileRow({ id: 'file-2', platform: 'GOOGLE', fileName: 'google123.html', content: '<html/>' }),
    ]))
    const dialog = await openDrawer(api)
    const table = within(dialog)
    expect(await table.findByText('MP_verify_abc.txt')).toBeTruthy()
    expect(table.getByText('google123.html')).toBeTruthy()
    // The platform label repeats in the picker's options, so only the badge is
    // asserted from the ledger's own row.
    expect(within(dialog.querySelector('table') as HTMLElement).getByText('微信公众号')).toBeTruthy()
    expect(within(dialog.querySelector('table') as HTMLElement).getByText('Google Search Console')).toBeTruthy()
    expect(api.verificationFiles.list).toHaveBeenCalledWith('zone-1')
  })

  it('opens the same drawer from the zone header and from a subdomain row', async () => {
    const api = makeClient()
    const onOpenVerification = vi.fn()
    render(
      <ZoneDetail
        client={api.client}
        zone={zoneRow()}
        t={t}
        onBack={() => {}}
        onZoneChanged={() => {}}
        onOpenVerification={onOpenVerification}
      />,
    )
    await screen.findByText('www.example.com')
    // The header button, then the row button of the one subdomain.
    const buttons = screen.getAllByRole('button', { name: '校验文件' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    expect(onOpenVerification).toHaveBeenCalledTimes(2)
  })
})

describe('verification files · upload', () => {
  it('fills the fields from a picked file and uploads it with an idempotency key', async () => {
    const api = makeClient()
    const dialog = await openDrawer(api)
    const view = within(dialog)

    fireEvent.change(view.getByLabelText(/选择文件/u), { target: { files: [pickedFile('MP_verify_new.txt', 'fresh-token')] } })
    await waitFor(() => {
      expect((view.getByLabelText('文件名') as HTMLInputElement).value).toBe('MP_verify_new.txt')
    })
    expect((view.getByLabelText('文件内容') as HTMLTextAreaElement).value).toBe('fresh-token')

    fireEvent.click(view.getByRole('button', { name: '上传' }))
    await waitFor(() => {
      expect(api.verificationFiles.create).toHaveBeenCalledWith(
        'zone-1',
        { platform: 'WECHAT_OFFICIAL_ACCOUNT', fileName: 'MP_verify_new.txt', content: 'fresh-token' },
        { idempotencyKey: expect.any(String) as string },
      )
    })
    expect(await view.findByText(zh['verification.uploaded'])).toBeTruthy()
    expect((view.getByLabelText('文件名') as HTMLInputElement).value).toBe('')
    expect(api.verificationFiles.list).toHaveBeenCalledTimes(2)
  })

  it('uploads a pasted file under a chosen platform', async () => {
    const api = makeClient()
    const dialog = await openDrawer(api)
    const view = within(dialog)

    fireEvent.change(view.getByLabelText('签发平台'), { target: { value: 'ALIPAY' } })
    fireEvent.change(view.getByLabelText('文件名'), { target: { value: 'alipay-token.txt' } })
    fireEvent.change(view.getByLabelText('文件内容'), { target: { value: 'alipay-body' } })
    fireEvent.click(view.getByRole('button', { name: '上传' }))
    await waitFor(() => {
      expect(api.verificationFiles.create).toHaveBeenCalledWith(
        'zone-1',
        { platform: 'ALIPAY', fileName: 'alipay-token.txt', content: 'alipay-body' },
        { idempotencyKey: expect.any(String) as string },
      )
    })
  })

  it('refuses a malformed name and an empty body before calling the service', async () => {
    const api = makeClient()
    const dialog = await openDrawer(api)
    const view = within(dialog)

    fireEvent.change(view.getByLabelText('文件名'), { target: { value: 'no-extension' } })
    fireEvent.change(view.getByLabelText('文件内容'), { target: { value: 'body' } })
    fireEvent.click(view.getByRole('button', { name: '上传' }))
    expect(view.getByText(zh['verification.file.invalidName'])).toBeTruthy()

    fireEvent.change(view.getByLabelText('文件名'), { target: { value: 'ok.txt' } })
    fireEvent.change(view.getByLabelText('文件内容'), { target: { value: '' } })
    fireEvent.click(view.getByRole('button', { name: '上传' }))
    expect(view.getByText(zh['verification.file.invalidContent'])).toBeTruthy()
    expect(api.verificationFiles.create).not.toHaveBeenCalled()
  })

  it('reports an oversized file, a binary file, and a malformed name at the picker', async () => {
    const api = makeClient()
    const dialog = await openDrawer(api)
    const view = within(dialog)
    const input = view.getByLabelText(/选择文件/u)

    fireEvent.change(input, { target: { files: [pickedFile('huge.txt', 'x'.repeat(4097))] } })
    expect(await view.findByText(zh['verification.file.tooLarge'])).toBeTruthy()

    fireEvent.change(input, { target: { files: [pickedFile('binary.txt', 'ok\u0000bad')] } })
    expect(await view.findByText(zh['verification.file.invalidContent'])).toBeTruthy()

    fireEvent.change(input, { target: { files: [pickedFile('no-extension', 'body')] } })
    expect(await view.findByText(zh['verification.file.invalidName'])).toBeTruthy()
    expect(api.verificationFiles.create).not.toHaveBeenCalled()
  })
})

describe('verification files · ledger', () => {
  it('self-checks a file and renders every verdict shape', async () => {
    const api = makeClient()
    const dialog = await openDrawer(api)
    const view = within(dialog)

    fireEvent.click(view.getByRole('button', { name: /^自检/u }))
    expect(await view.findByText(zh['verification.matched'])).toBeTruthy()
    expect(api.verificationFiles.check).toHaveBeenCalledWith('zone-1', 'file-1')

    api.verificationFiles.check.mockResolvedValueOnce({
      matched: false,
      reachable: true,
      statusCode: 200,
      scheme: 'http',
      detail: 'content differs',
      checkedAt: '2026-01-02T00:00:00.000Z',
    } as never)
    fireEvent.click(view.getByRole('button', { name: /^自检/u }))
    expect(await view.findByText(zh['verification.reachableMismatch'])).toBeTruthy()
    expect(view.getByText('content differs')).toBeTruthy()
    expect(view.getByText('HTTP')).toBeTruthy()

    api.verificationFiles.check.mockResolvedValueOnce({
      matched: false,
      reachable: false,
      checkedAt: '2026-01-02T00:00:00.000Z',
    } as never)
    fireEvent.click(view.getByRole('button', { name: /^自检/u }))
    expect(await view.findByText(zh['verification.unreachable'])).toBeTruthy()
  })

  it('deletes a file only after the inline confirmation', async () => {
    const api = makeClient()
    const dialog = await openDrawer(api)
    const view = within(dialog)
    await view.findByText('MP_verify_abc.txt')

    fireEvent.click(view.getByRole('button', { name: /^删除/u }))
    fireEvent.click(view.getByRole('button', { name: '取消' }))
    expect(api.verificationFiles.delete).not.toHaveBeenCalled()

    fireEvent.click(view.getByRole('button', { name: /^删除/u }))
    fireEvent.click(view.getByRole('button', { name: /^确认删除/u }))
    await waitFor(() => {
      expect(api.verificationFiles.delete).toHaveBeenCalledWith('zone-1', 'file-1')
    })
    expect(api.verificationFiles.list).toHaveBeenCalledTimes(2)
  })

  it('shows the empty ledger and closes from the drawer control', async () => {
    const api = makeClient()
    api.verificationFiles.list.mockResolvedValue(page([]))
    const dialog = await openDrawer(api)
    const view = within(dialog)
    expect(await view.findByText(zh['verification.empty'])).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog', { name: '域名归属校验文件' })).toBeNull()
  })

  it('falls back to the custom platform label and the empty timestamp', async () => {
    const api = makeClient()
    api.verificationFiles.list.mockResolvedValueOnce(page([
      fileRow({ id: 'file-9', platform: 'FUTURE_PLATFORM' as never, fileName: 'future.txt', updatedAt: '' }),
    ]))
    const dialog = await openDrawer(api)
    const view = within(dialog)
    const table = within(dialog.querySelector('table') as HTMLElement)
    expect(await table.findByText('future.txt')).toBeTruthy()
    expect(table.getByText(zh['verification.platform.CUSTOM'])).toBeTruthy()
    expect(table.getAllByText('—').length).toBeGreaterThanOrEqual(1)
    // An empty picker change is a no-op rather than an error.
    fireEvent.change(view.getByLabelText(/选择文件/u), { target: { files: [] } })
    expect(view.queryByText(zh['verification.file.invalidName'])).toBeNull()
  })

  it('opens the drawer from the zone detail header inside the workspace', async () => {
    const api = makeClient()
    render(<DnsWorkspace client={api.client} t={t} />)
    await screen.findByText('example.com')
    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    await screen.findByText('www.example.com')
    // In the detail view the header and the one subdomain row both offer it.
    fireEvent.click(screen.getAllByRole('button', { name: '校验文件' })[0])
    expect(await screen.findByRole('dialog', { name: '域名归属校验文件' })).toBeTruthy()
    expect(api.verificationFiles.list).toHaveBeenCalledWith('zone-1')
  })

  it('surfaces a failed load, retries it, and reports failed writes', async () => {
    const api = makeClient()
    api.verificationFiles.list.mockRejectedValueOnce(new Error('verification ledger down'))
    const dialog = await openDrawer(api)
    const view = within(dialog)
    expect(await view.findByText('verification ledger down')).toBeTruthy()

    fireEvent.click(view.getByRole('button', { name: '重试' }))
    expect(await view.findByText('MP_verify_abc.txt')).toBeTruthy()

    // A write rejection without a message reads as the generic action copy.
    api.verificationFiles.create.mockRejectedValueOnce({})
    fireEvent.change(view.getByLabelText('文件名'), { target: { value: 'ok.txt' } })
    fireEvent.change(view.getByLabelText('文件内容'), { target: { value: 'body' } })
    fireEvent.click(view.getByRole('button', { name: '上传' }))
    expect(await view.findByText(zh['action.failed'])).toBeTruthy()

    api.verificationFiles.delete.mockRejectedValueOnce(new Error('file locked'))
    fireEvent.click(view.getByRole('button', { name: /^删除/u }))
    fireEvent.click(view.getByRole('button', { name: /^确认删除/u }))
    expect(await view.findByText('file locked')).toBeTruthy()

    api.verificationFiles.check.mockRejectedValueOnce(new Error('probe unavailable'))
    fireEvent.click(view.getByRole('button', { name: /^自检/u }))
    expect(await view.findByText('probe unavailable')).toBeTruthy()
  })
})
