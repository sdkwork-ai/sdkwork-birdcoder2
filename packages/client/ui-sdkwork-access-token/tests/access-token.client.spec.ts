/**
 * Public application access token generation: the claims and the exact
 * serialization `tools/app-access-token.mjs` produces for the same inputs, the
 * tenant/organization scope rules, and the decoder's fail-closed checks.
 */

import { describe, expect, it } from 'vitest'
import {
  CLIENT_DEPLOYMENT_PROFILES, CLIENT_ENVIRONMENTS, PUBLIC_APP_ACCESS_TOKEN_ISSUED_AT,
  PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY, RUNTIME_TARGETS, buildPublicApplicationAccessToken,
  clientProfileIds, decodePublicApplicationAccessToken, deploymentModeOf,
  isApplicationAccessTokenExpiryPermanent, parseClientProfileId, profileIdOf,
  summarizePublicApplicationAccessToken,
} from '../src/client/accessToken.ts'
import type { AccessTokenProfile } from '../src/client/accessToken.ts'
import referenceTokens from './fixtures/reference-tokens.json'

/**
 * Tokens the canonical generator printed for the two fixtures (see the
 * fixture's `README` in the package handoff): the generator is the source of
 * truth for the byte-for-byte serialization this builder must match.
 */
const TENANT_LEVEL_GOLDEN = referenceTokens.tenantLevel
const ORGANIZATION_LEVEL_GOLDEN = referenceTokens.organizationLevel

/** Development/standalone profile fixture. */
const DEV_PROFILE: AccessTokenProfile = { deploymentProfile: 'standalone', environment: 'development' }

/** Production/cloud profile fixture. */
const PRODUCTION_PROFILE: AccessTokenProfile = { deploymentProfile: 'cloud', environment: 'production' }

/** Decode one unpadded base64url segment as UTF-8 text. */
function decodeSegment(segment: string): string {
  const normalized = segment.replace(/-/gu, '+').replace(/_/gu, '/')
  return globalThis.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
}

/** Encode UTF-8 text as one unpadded base64url segment. */
function encodeSegment(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}

describe('the profile matrix', () => {
  it('renders the ten canonical ids in deployment-profile then lifecycle order', () => {
    const ids = clientProfileIds()
    expect(ids).toHaveLength(CLIENT_DEPLOYMENT_PROFILES.length * CLIENT_ENVIRONMENTS.length)
    expect(ids[0]?.profileId).toBe('standalone.development')
    expect(ids.at(-1)?.profileId).toBe('cloud.production')
    expect(ids.map(profile => profile.profileId)).toContain('cloud.demo')
  })

  it('parses a profile id and refuses anything outside the closed set', () => {
    expect(parseClientProfileId('cloud.staging')).toEqual({
      profileId: 'cloud.staging',
      deploymentProfile: 'cloud',
      environment: 'staging',
    })
    expect(parseClientProfileId('local.development')).toBeUndefined()
    expect(parseClientProfileId('cloud.production.extra')).toBeUndefined()
    expect(profileIdOf(PRODUCTION_PROFILE)).toBe('cloud.production')
  })

  it('maps cloud to saas and standalone to private', () => {
    expect(deploymentModeOf('cloud')).toBe('saas')
    expect(deploymentModeOf('standalone')).toBe('private')
  })
})

describe('buildPublicApplicationAccessToken', () => {
  it('reproduces the canonical tenant-level token byte for byte', () => {
    const token = buildPublicApplicationAccessToken({
      identity: { appId: 'sdkwork-im-pc', tenantId: '100001', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      level: 'tenant',
    })
    expect(token).toBe(TENANT_LEVEL_GOLDEN)
  })

  it('reproduces the canonical organization-level token byte for byte', () => {
    const token = buildPublicApplicationAccessToken({
      identity: { appId: 'sdkwork-im-pc', tenantId: '100001', organizationId: '42' },
      profile: PRODUCTION_PROFILE,
      runtimeTarget: 'browser',
      level: 'organization',
    })
    expect(token).toBe(ORGANIZATION_LEVEL_GOLDEN)
  })

  it('is deterministic across calls and refuses a tenant level bound to an organization', () => {
    const first = buildPublicApplicationAccessToken({
      identity: { appId: 'sdkwork-im-pc', tenantId: '100001', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      level: 'tenant',
    })
    const second = buildPublicApplicationAccessToken({
      identity: { appId: 'sdkwork-im-pc', tenantId: '100001', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      level: 'tenant',
    })
    expect(second).toBe(first)
    const { payload } = decodePublicApplicationAccessToken(first)
    expect(payload.organization_id).toBe('0')
    expect(payload.login_scope).toBe('TENANT')
    expect(payload.ownership_scope).toBe('TENANT')
    // An explicit tenant level cannot silently discard an organization binding;
    // the canonical generator refuses the same contradiction.
    expect(() => buildPublicApplicationAccessToken({
      identity: { appId: 'sdkwork-im-pc', tenantId: '100001', organizationId: '42' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      level: 'tenant',
    })).toThrow(/level=tenant contradicts organizationId=42/u)
  })

  it('derives the level from a non-zero organization when none is passed', () => {
    const token = buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: '7', organizationId: '9' },
      profile: PRODUCTION_PROFILE,
      runtimeTarget: 'browser',
    })
    const { payload } = decodePublicApplicationAccessToken(token)
    expect(payload.organization_id).toBe('9')
    expect(payload.login_scope).toBe('ORGANIZATION')
    expect(payload.ownership_scope).toBe('ORGANIZATION')
    expect(payload.user_id).toBe('0')
  })

  it('keeps the fixed generation instants and a bootstrap session id', () => {
    const token = buildPublicApplicationAccessToken({
      identity: { appId: 'sdkwork-im-pc', tenantId: '100001', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
    })
    const { payload } = decodePublicApplicationAccessToken(token)
    expect(payload.iat).toBe(PUBLIC_APP_ACCESS_TOKEN_ISSUED_AT)
    expect(payload.exp).toBe(PUBLIC_APP_ACCESS_TOKEN_NO_EXPIRY)
    expect(payload.exp).toBe(0)
    expect(isApplicationAccessTokenExpiryPermanent(payload.exp)).toBe(true)
    expect(payload.session_id).toBe('bootstrap-public-sdkwork-im-pc-standalone.development')
    expect(payload.token_class).toBe('application')
    expect(payload.token_type).toBe('access')
    expect(payload.permission_scope).toEqual(['iam:self'])
    expect(payload.deployment_profile).toBe('standalone')
    expect(payload.deployment_mode).toBe('private')
    expect(payload.runtime_target).toBe('browser')
  })

  it('accepts every canonical runtime target', () => {
    for (const runtimeTarget of RUNTIME_TARGETS) {
      const token = buildPublicApplicationAccessToken({
        identity: { appId: 'app', tenantId: '1', organizationId: '0' },
        profile: DEV_PROFILE,
        runtimeTarget,
      })
      expect(summarizePublicApplicationAccessToken(token).runtimeTarget).toBe(runtimeTarget)
    }
  })

  it('fails closed on a missing identity, a zero organization binding, or an unknown target', () => {
    expect(() => buildPublicApplicationAccessToken({
      identity: { appId: '', tenantId: '1', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
    })).toThrow(/appId/)
    expect(() => buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: '100001', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      level: 'organization',
    })).toThrow(/organizationId/)
    expect(() => buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: '100001', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'spaceship' as never,
    })).toThrow(/runtimeTarget/)
    expect(() => buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: 'tenant-a', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
    })).toThrow(/tenantId/)
  })

  it('deduplicates an explicit permission scope and keeps its order', () => {
    const token = buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: '1', organizationId: '0' },
      permissionScope: ['iam:self', 'iam:self', 'app:read'],
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
    })
    expect(decodePublicApplicationAccessToken(token).payload.permission_scope)
      .toEqual(['iam:self', 'app:read'])
  })

  it('keeps an explicit rotation deadline and refuses one at or before issuance', () => {
    const rotation = buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: '1', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      expiresAt: PUBLIC_APP_ACCESS_TOKEN_ISSUED_AT + 86_400,
    })
    expect(decodePublicApplicationAccessToken(rotation).payload.exp)
      .toBe(PUBLIC_APP_ACCESS_TOKEN_ISSUED_AT + 86_400)
    expect(() => buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: '1', organizationId: '0' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      expiresAt: PUBLIC_APP_ACCESS_TOKEN_ISSUED_AT,
    })).toThrow(/must be after the token's issuedAt/u)
  })
})

describe('decodePublicApplicationAccessToken', () => {
  it('rejects malformed serializations, headers, and scopes', () => {
    expect(() => decodePublicApplicationAccessToken('one.two')).toThrow(/three-part/u)
    expect(() => decodePublicApplicationAccessToken('a.b.c')).toThrow(/valid JSON/u)
    const good = TENANT_LEVEL_GOLDEN
    const [header, payload, signature] = good.split('.')
    expect(() => decodePublicApplicationAccessToken(`${header}.${payload}.secret`)).toThrow(/signature/u)
    expect(() => decodePublicApplicationAccessToken(`${header}.${payload}.${signature}x`))
      .toThrow(/signature/u)
    // A contradictory login_scope is refused before any identity comparison.
    const [orgHeader, orgPayload] = buildPublicApplicationAccessToken({
      identity: { appId: 'app', tenantId: '1', organizationId: '42' },
      profile: DEV_PROFILE,
      runtimeTarget: 'browser',
      level: 'organization',
    }).split('.')
    const decoded = JSON.parse(decodeSegment(orgPayload ?? '')) as Record<string, unknown>
    decoded.login_scope = 'TENANT'
    const contradictory = `${orgHeader}.${encodeSegment(JSON.stringify(decoded))}.public`
    expect(() => decodePublicApplicationAccessToken(contradictory)).toThrow(/login_scope/u)
  })

  it('refuses a malformed exp claim while accepting permanent and future deadlines', () => {
    const [header, payload] = TENANT_LEVEL_GOLDEN.split('.')
    const claims = JSON.parse(decodeSegment(payload ?? '')) as Record<string, unknown>
    claims.exp = 'soon'
    expect(() => decodePublicApplicationAccessToken(
      `${header}.${encodeSegment(JSON.stringify(claims))}.public`,
    )).toThrow(/exp claim/u)
    claims.exp = -1
    expect(() => decodePublicApplicationAccessToken(
      `${header}.${encodeSegment(JSON.stringify(claims))}.public`,
    )).toThrow(/exp claim/u)
    // An absent claim is permanent, exactly like the sentinel.
    delete claims.exp
    expect(decodePublicApplicationAccessToken(
      `${header}.${encodeSegment(JSON.stringify(claims))}.public`,
    ).payload.exp).toBeUndefined()
  })

  it('summarizes the isolation claims the dialog preview shows', () => {
    expect(summarizePublicApplicationAccessToken(TENANT_LEVEL_GOLDEN)).toEqual({
      appId: 'sdkwork-im-pc',
      tenantId: '100001',
      organizationId: '0',
      loginScope: 'TENANT',
      ownershipScope: 'TENANT',
      environment: 'development',
      deploymentProfile: 'standalone',
      runtimeTarget: 'browser',
      permissionScope: ['iam:self'],
    })
  })
})
