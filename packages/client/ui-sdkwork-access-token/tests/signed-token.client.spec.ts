/**
 * Signed-token rules: ownership filtering, JWT decoding, and the fail-closed
 * validation every issued credential passes before the dialog shows it.
 */
import { describe, expect, it } from 'vitest'
import type {
  MyApplication, SdkworkSession, SignedAccessCredential,
} from '../src/client/signedToken.ts'
import {
  assertExchangeInput, assertLoginInput, decodeSignedAccessToken, initialLoginValues, isOwnApplication,
  ownApplications, resolveSdkworkGateway, userIdOfToken, validateSignedCredential,
} from '../src/client/signedToken.ts'

/** Encode one UTF-8 JSON value as an unpadded base64url segment. */
function encodeSegment(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

/** Build one signed-looking JWT with the given header/claims. */
function jwt(header: Record<string, unknown>, claims: Record<string, unknown>): string {
  return `${encodeSegment(header)}.${encodeSegment(claims)}.c2lnbmF0dXJl`
}

/** The session fixture every case builds on. */
function session(overrides: Partial<SdkworkSession> = {}): SdkworkSession {
  return {
    baseUrl: 'https://api-dev.sdkwork.com',
    accessToken: 'session-access',
    authToken: 'session-auth',
    userId: '42',
    username: 'alice',
    tenantId: '100001',
    source: 'password',
    ...overrides,
  }
}

/** One application fixture. */
function application(overrides: Partial<MyApplication> = {}): MyApplication {
  return {
    anchor: '381157858269466624',
    id: 'app-uuid',
    name: 'Alice App',
    slug: 'alice-app',
    ownershipScope: 'USER',
    ownerUserId: '42',
    organizationId: '0',
    createdBy: '42',
    status: 'ACTIVE',
    ...overrides,
  }
}

/** One valid issued credential for the fixtures. */
function credential(
  app: MyApplication,
  current: SdkworkSession,
  options: { claims?: Record<string, unknown>; expiresAt?: string; ownershipScope?: string } = {},
): SignedAccessCredential {
  const now = Math.floor(Date.now() / 1000)
  const claims = {
    app_id: app.anchor,
    aud: app.anchor,
    tenant_id: current.tenantId,
    organization_id: app.organizationId,
    ownership_scope: app.ownershipScope,
    user_id: current.userId,
    token_class: 'access',
    iat: now,
    exp: now + 3600,
    ...options.claims,
  }
  return {
    accessToken: jwt({ alg: 'RS256', kid: 'tenant-key', typ: 'JWT' }, claims),
    authToken: 'signed-auth-token',
    expiresAt: options.expiresAt ?? new Date(Date.now() + 3600_000).toISOString(),
    appId: app.anchor,
    tenantApplicationId: 'tapp_1',
    ownershipScope: (options.ownershipScope ?? app.ownershipScope) as SignedAccessCredential['ownershipScope'],
    environment: 'development',
    claims,
  }
}

/** Expected validation input for the fixtures. */
function expected(app: MyApplication, current: SdkworkSession) {
  return { application: app, session: current, environment: 'development' as const }
}

describe('ownership filtering', () => {
  it('accepts a USER-owned application and a created-by application', () => {
    expect(isOwnApplication(application(), '42')).toBe(true)
    expect(isOwnApplication(application({ ownershipScope: 'TENANT', ownerUserId: undefined }), '42')).toBe(true)
    expect(isOwnApplication(application({ ownershipScope: 'USER', ownerUserId: '7', createdBy: '7' }), '42'))
      .toBe(false)
    expect(isOwnApplication(
      application({ createdBy: undefined, ownershipScope: 'TENANT', ownerUserId: undefined }), '42',
    )).toBe(false)
    expect(isOwnApplication(application(), '')).toBe(false)
  })

  it('accepts a created-by account name for older rows and still rejects a foreign user', () => {
    expect(isOwnApplication(
      application({ ownershipScope: 'TENANT', ownerUserId: undefined, createdBy: 'alice' }), '42', 'alice',
    )).toBe(true)
    expect(isOwnApplication(
      application({ ownershipScope: 'TENANT', ownerUserId: undefined, createdBy: 'alice' }), '42', '',
    )).toBe(false)
    expect(isOwnApplication(
      application({ ownershipScope: 'TENANT', ownerUserId: undefined, createdBy: 'carol' }), '42', 'alice',
    )).toBe(false)
  })

  it('keeps only own applications with an anchor, name-sorted', () => {
    const mine = ownApplications([
      application({ anchor: 'b', name: 'Beta' }),
      application({ anchor: 'a', name: 'Alpha' }),
      application({ anchor: 'c', name: 'Foreign', createdBy: '7', ownershipScope: 'USER', ownerUserId: '7' }),
      application({ anchor: '', name: 'No anchor' }),
    ], '42')
    expect(mine.map(app => app.name)).toEqual(['Alpha', 'Beta'])
  })
})

describe('decodeSignedAccessToken', () => {
  it('decodes a signed header and refuses alg:none', () => {
    const token = jwt({ alg: 'RS256' }, { app_id: 'a' })
    expect(decodeSignedAccessToken(token).header.alg).toBe('RS256')
    expect(() => decodeSignedAccessToken(jwt({ alg: 'none' }, { app_id: 'a' }))).toThrow(/alg:none/u)
    expect(() => decodeSignedAccessToken('nope')).toThrow(/three-part/u)
  })

  it('reads the user id claim', () => {
    expect(userIdOfToken(jwt({ alg: 'RS256' }, { user_id: '42' }))).toBe('42')
    expect(userIdOfToken(jwt({ alg: 'RS256' }, { sub: '9' }))).toBe('9')
    expect(userIdOfToken('broken')).toBe('')
  })
})

describe('validateSignedCredential', () => {
  it('accepts the matching credential and returns its claims', () => {
    const current = session()
    const app = application()
    expect(validateSignedCredential(credential(app, current), expected(app, current)))
      .toMatchObject({ app_id: app.anchor, user_id: '42' })
  })

  it('refuses a different anchor, release scope, or owner', () => {
    const current = session()
    const app = application()
    expect(() => validateSignedCredential({ ...credential(app, current), appId: 'other-anchor' }, expected(app, current)))
      .toThrow(/not the selected/u)
    expect(() => validateSignedCredential(credential(app, current, { ownershipScope: 'TENANT' }), expected(app, current)))
      .toThrow(/release scope/u)
    const foreign = application({ ownershipScope: 'USER', ownerUserId: '7', createdBy: '7' })
    expect(() => validateSignedCredential(credential(foreign, current), expected(foreign, current)))
      .toThrow(/created by the signed-in user/u)
  })

  it('refuses a public isolation token, another tenant, or another owner', () => {
    const current = session()
    const app = application()
    expect(() => validateSignedCredential(
      credential(app, current, { claims: { token_class: 'application' } }), expected(app, current),
    )).toThrow(/public isolation token/u)
    expect(() => validateSignedCredential(
      credential(app, current, { claims: { tenant_id: '999' } }), expected(app, current),
    )).toThrow(/tenant/u)
    expect(() => validateSignedCredential(
      credential(app, current, { claims: { user_id: '7' } }), expected(app, current),
    )).toThrow(/owner/u)
  })

  it('refuses an expired or over-long lifetime', () => {
    const current = session()
    const app = application()
    const now = Math.floor(Date.now() / 1000)
    expect(() => validateSignedCredential(
      credential(app, current, { claims: { exp: now - 10 } }),
      { ...expected(app, current), now },
    )).toThrow(/expired/u)
    expect(() => validateSignedCredential(
      credential(app, current, { claims: { exp: now + 7200 } }),
      { ...expected(app, current), now },
    )).toThrow(/lifetime/u)
    expect(() => validateSignedCredential(
      credential(app, current, { expiresAt: new Date(Date.now() - 1000).toISOString() }),
      expected(app, current),
    )).toThrow(/expiresAt/u)
  })

  it('refuses a credential gated on another environment', () => {
    const current = session()
    const app = application()
    expect(() => validateSignedCredential(
      { ...credential(app, current), environment: 'production' }, expected(app, current),
    )).toThrow(/environment/u)
  })
})

describe('gateway and input validation', () => {
  it('prefers the remembered login and falls back to the environment profile', () => {
    const remembered = {
      username: 'alice', password: 'pw', baseUrl: 'https://cfg',
      bootstrapAccessToken: 'cfg-token', environment: 'development',
    }
    expect(resolveSdkworkGateway(remembered, {
      baseUrl: 'https://env', bootstrapAccessToken: 'env-token',
    })).toEqual({ baseUrl: 'https://cfg', bootstrapAccessToken: 'cfg-token' })
    expect(resolveSdkworkGateway(undefined, {
      baseUrl: 'https://env', bootstrapAccessToken: 'env-token',
    })).toEqual({ baseUrl: 'https://env', bootstrapAccessToken: 'env-token' })
    expect(initialLoginValues({ ...remembered, username: ' alice ' })).toEqual({ username: 'alice', password: 'pw' })
    expect(initialLoginValues(undefined)).toEqual({ username: '', password: '' })
  })

  it('names the missing login fact', () => {
    const gateway = { baseUrl: 'https://api', bootstrapAccessToken: 'token' }
    expect(() => { assertLoginInput({ username: '', password: 'x' }, gateway) }).toThrow(/account/u)
    expect(() => { assertLoginInput({ username: 'alice', password: '' }, gateway) }).toThrow(/password/u)
    expect(() => {
      assertLoginInput({ username: 'alice', password: 'x' }, {
        baseUrl: '', bootstrapAccessToken: 'token',
      })
    }).toThrow(/base URL/u)
    expect(() => {
      assertLoginInput({ username: 'alice', password: 'x' }, {
        baseUrl: 'https://api', bootstrapAccessToken: '',
      })
    }).toThrow(/bootstrap/u)
    expect(() => { assertLoginInput({ username: 'alice', password: 'x' }, gateway) }).not.toThrow()
  })

  it('refuses an exchange for a foreign application or a missing anchor', () => {
    const current = session()
    expect(() => { assertExchangeInput(application(), current, 'development') }).not.toThrow()
    expect(() => {
      assertExchangeInput(
        application({ ownershipScope: 'USER', ownerUserId: '7', createdBy: '7' }), current, 'development',
      )
    }).toThrow(/created by the signed-in user/u)
    expect(() => { assertExchangeInput(application({ anchor: '' }), current, 'development') }).toThrow(/anchor/u)
    expect(() => { assertExchangeInput(application(), current, 'nope' as never) }).toThrow(/environment/u)
  })
})
