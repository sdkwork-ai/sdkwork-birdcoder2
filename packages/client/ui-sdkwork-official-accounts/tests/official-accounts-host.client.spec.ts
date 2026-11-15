/** The official-account host adapter: readiness, controller rebuilds, and token mirroring. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getSdkworkGlobalTokenManager,
  resetSdkworkGlobalTokenManager,
} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager'
import {
  OfficialAccountsHost,
  mountOfficialAccountsHost,
  type OfficialAccountsHostEnvironment,
  type OfficialAccountsHostIam,
  type OfficialAccountsHostSession,
} from '../src/client/officialAccountsHost.ts'
import {
  DomainVerificationPort,
  matchManagedZone,
} from '../src/client/officialAccountDomainVerification.ts'

interface HarnessOptions {
  baseUrl?: string
  accessToken?: string
  session?: OfficialAccountsHostSession | null
  serverIps?: readonly string[]
}

/** Bench the adapter over a driven environment/session pair. */
function harness(options: HarnessOptions = {}) {
  let baseUrl = options.baseUrl ?? ''
  let accessToken = options.accessToken ?? ''
  let session = options.session ?? null
  const serverIps = options.serverIps ?? []
  const environmentListeners = new Set<() => void>()
  const iamListeners = new Set<() => void>()
  const env: OfficialAccountsHostEnvironment = {
    apiBaseUrl: () => baseUrl,
    accessToken: () => accessToken,
    officialAccountServerIps: () => serverIps,
    subscribe: (listener) => {
      environmentListeners.add(listener)
      return () => { environmentListeners.delete(listener) }
    },
  }
  const iam: OfficialAccountsHostIam = {
    controller: {
      getState: () => ({ session }),
      subscribe: (listener) => {
        iamListeners.add(listener)
        return () => { iamListeners.delete(listener) }
      },
    },
  }
  const setEnvironment = (next: Partial<HarnessOptions>): void => {
    const environmentChanged = next.baseUrl !== undefined || next.accessToken !== undefined
    if (next.baseUrl !== undefined) baseUrl = next.baseUrl
    if (next.accessToken !== undefined) accessToken = next.accessToken
    if (next.session !== undefined) session = next.session
    if (environmentChanged) for (const listener of [...environmentListeners]) listener()
    if (next.session !== undefined) for (const listener of [...iamListeners]) listener()
  }
  return { env, iam, setEnvironment }
}

afterEach(() => {
  resetSdkworkGlobalTokenManager()
})

describe('OfficialAccountsHost', () => {
  it('reports readiness from the gateway origin only', () => {
    expect(new OfficialAccountsHost(harness()).readReady()).toBe(false)
    expect(new OfficialAccountsHost(harness({ baseUrl: 'https://gateway.example' })).readReady()).toBe(true)
  })

  it('exposes no controller without a gateway origin', () => {
    expect(new OfficialAccountsHost(harness()).readController()).toBeUndefined()
  })

  it('reads the deployment-published server egress IPs from the environment', () => {
    const host = mountOfficialAccountsHost(harness({ serverIps: ['1.2.3.4', '5.6.7.8'] }))
    expect(host.readServerIps()).toEqual(['1.2.3.4', '5.6.7.8'])
    host.dispose()
    expect(mountOfficialAccountsHost(harness()).readServerIps()).toEqual([])
  })

  it('rebuilds the domain verification capability when a different account takes over', () => {
    const bench = harness({
      baseUrl: 'https://gateway.example',
      session: { accessToken: 'token-a', context: { tenantId: 'tenant', userId: 'user-a' } },
    })
    const host = mountOfficialAccountsHost(bench)
    const first = host.readDomainVerification()
    expect(first).toBeDefined()
    bench.setEnvironment({
      session: { accessToken: 'token-a', context: { tenantId: 'tenant', userId: 'user-b' } },
    })
    expect(host.readDomainVerification()).not.toBe(first)
    host.dispose()
  })

  it('exposes no Drive logo upload service without a gateway origin', () => {
    expect(new OfficialAccountsHost(harness()).readLogoUploadService()).toBeUndefined()
  })

  it('builds one Drive logo upload service per gateway origin and identity', () => {
    const bench = harness({
      baseUrl: 'https://gateway.example',
      session: { accessToken: 'token-a', context: { tenantId: 'tenant', userId: 'user-a' } },
    })
    const host = mountOfficialAccountsHost(bench)
    const first = host.readLogoUploadService()
    expect(first).toBeDefined()
    expect(typeof first?.upload).toBe('function')
    expect(typeof first?.resolvePreview).toBe('function')
    expect(host.readLogoUploadService()).toBe(first)

    // A different origin invalidates the cached client and its service.
    bench.setEnvironment({ baseUrl: 'https://other.example' })
    const second = host.readLogoUploadService()
    expect(second).not.toBe(first)

    // A different account invalidates the per-account preview cache too.
    bench.setEnvironment({ session: { accessToken: 'token-b', context: { tenantId: 'tenant', userId: 'user-b' } } })
    expect(host.readLogoUploadService()).not.toBe(second)
    host.dispose()
    expect(host.readLogoUploadService()).toBeUndefined()
  })

  it('builds one controller per gateway origin and rebuilds it when the origin changes', () => {
    const bench = harness({ baseUrl: 'https://gateway.example' })
    const host = mountOfficialAccountsHost(bench)
    const first = host.readController()
    expect(first).toBeDefined()
    expect(host.readController()).toBe(first)

    bench.setEnvironment({ baseUrl: 'https://other.example' })
    expect(host.readController()).not.toBe(first)
    host.dispose()
  })

  it('mirrors the IAM session into the shared token manager before a read', () => {
    const bench = harness({
      baseUrl: 'https://gateway.example',
      accessToken: 'env-access-token',
      session: { accessToken: 'session-access', authToken: 'session-auth', refreshToken: 'session-refresh' },
    })
    const host = mountOfficialAccountsHost(bench)
    host.readController()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: 'session-access',
      authToken: 'session-auth',
      refreshToken: 'session-refresh',
    })

    bench.setEnvironment({ session: null, accessToken: '' })
    host.readController()
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({})
    host.dispose()
  })

  it('falls back to the static access token while signed out', () => {
    const bench = harness({ baseUrl: 'https://gateway.example', accessToken: 'env-access-token' })
    const host = mountOfficialAccountsHost(bench)
    host.readController()
    expect(getSdkworkGlobalTokenManager().getAccessToken()).toBe('env-access-token')
    host.dispose()
  })

  it('publishes environment and session changes and stops after dispose', () => {
    const bench = harness({ baseUrl: 'https://gateway.example' })
    const host = mountOfficialAccountsHost(bench)
    const seen: number[] = []
    const off = host.subscribe(() => { seen.push(seen.length) })
    bench.setEnvironment({ baseUrl: 'https://other.example' })
    bench.setEnvironment({ session: { accessToken: 'token' } })
    expect(seen).toHaveLength(2)

    host.dispose()
    const afterDispose = seen.length
    bench.setEnvironment({ baseUrl: 'https://third.example' })
    expect(seen).toHaveLength(afterDispose)
    off()
  })

  it('reads the signed-in identity from the session context and profile id', () => {
    const bench = harness({
      baseUrl: 'https://gateway.example',
      session: { accessToken: 'token-a', context: { tenantId: 'tenant', userId: 'user-a', organizationId: 'org' } },
    })
    const host = mountOfficialAccountsHost(bench)
    expect(host.readIdentityKey()).toBe('tenant:user-a')

    bench.setEnvironment({ session: { accessToken: 'token', user: { id: 'user-b' }, context: { tenantId: 'tenant' } } })
    expect(host.readIdentityKey()).toBe('tenant:user-b')

    bench.setEnvironment({ session: null })
    expect(host.readIdentityKey()).toBe('')
    host.dispose()
  })

  it('rebuilds the controller when a different account takes over', () => {
    const bench = harness({
      baseUrl: 'https://gateway.example',
      session: { accessToken: 'token-a', context: { tenantId: 'tenant', userId: 'user-a' } },
    })
    const host = mountOfficialAccountsHost(bench)
    const first = host.readController()
    expect(first).toBeDefined()

    // Same account, rotated token: the controller keeps its state.
    bench.setEnvironment({ session: { accessToken: 'token-a2', context: { tenantId: 'tenant', userId: 'user-a' } } })
    expect(host.readController()).toBe(first)

    // Different account: the previous account's cached channel list must go.
    bench.setEnvironment({ session: { accessToken: 'token-b', context: { tenantId: 'tenant', userId: 'user-b' } } })
    expect(host.readController()).not.toBe(first)
    host.dispose()
  })
})

describe('managed zone matching', () => {
  it('matches the apex or a label suffix and prefers the longest zone', () => {
    const zones = [
      { id: 'zone-apex', apexHostname: 'example.com' },
      { id: 'zone-sub', apexHostname: 'sub.example.com' },
    ]
    expect(matchManagedZone('api.example.com', zones)?.id).toBe('zone-apex')
    expect(matchManagedZone('x.sub.example.com', zones)?.id).toBe('zone-sub')
    expect(matchManagedZone('example.com', zones)?.id).toBe('zone-apex')
    expect(matchManagedZone('api.example.com.', zones)?.id).toBe('zone-apex')
    expect(matchManagedZone('badexample.com', zones)).toBeUndefined()
    expect(matchManagedZone('', zones)).toBeUndefined()
  })
})

describe('DomainVerificationPort', () => {
  /** A Deploy client double covering the zone list and the verification calls. */
  function verificationClient(zones: readonly { id: string; apexHostname: string }[]) {
    const list = vi.fn(async () => ({
      items: zones.map(zone => ({ ...zone })),
      pageInfo: { mode: 'offset' as const, page: 1, pageSize: 200, totalItems: String(zones.length) },
    }))
    const retrieve = vi.fn(async (zoneId: string) => ({
      zoneId,
      fileName: 'MP_verify_a.txt',
      content: 'token',
      updatedAt: '2026-01-01T00:00:00Z',
    }))
    const upsert = vi.fn(
      async (zoneId: string, file: { fileName: string; content: string }) => ({
        zoneId,
        fileName: file.fileName,
        content: file.content,
      }),
    )
    return {
      client: {
        domain: { domainZones: { list, wechatVerification: { retrieve, upsert } } },
      },
      list,
      retrieve,
      upsert,
    }
  }

  it('reads and replaces the verification file of the domain’s zone', async () => {
    const fake = verificationClient([{ id: 'zone-apex', apexHostname: 'example.com' }])
    const port = new DomainVerificationPort(
      fake.client as unknown as ConstructorParameters<typeof DomainVerificationPort>[0],
    )
    expect(await port.read('api.example.com')).toEqual({
      managed: true,
      fileName: 'MP_verify_a.txt',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    expect(fake.retrieve).toHaveBeenCalledWith('zone-apex')
    expect(await port.upload('api.example.com', {
      fileName: 'MP_verify_b.txt',
      content: 'token-b',
    })).toEqual({ managed: true, fileName: 'MP_verify_b.txt' })
    expect(fake.upsert).toHaveBeenCalledWith('zone-apex', {
      fileName: 'MP_verify_b.txt',
      content: 'token-b',
    })
    // The zone list is resolved once per port, not per domain read.
    expect(fake.list).toHaveBeenCalledTimes(1)
  })

  it('reports a domain outside the managed zones without touching the file API', async () => {
    const fake = verificationClient([{ id: 'zone-apex', apexHostname: 'example.com' }])
    const port = new DomainVerificationPort(
      fake.client as unknown as ConstructorParameters<typeof DomainVerificationPort>[0],
    )
    expect(await port.read('api.other.test')).toEqual({ managed: false })
    expect(fake.retrieve).not.toHaveBeenCalled()
    await expect(port.upload('api.other.test', {
      fileName: 'MP_verify_b.txt',
      content: 'token-b',
    })).rejects.toThrow('is not managed by this deployment')
    expect(fake.upsert).not.toHaveBeenCalled()
  })
})
