import { describe, expect, it } from 'vitest'
import {
  DEPLOY_APPLICATION_ID_ENV,
  PENDING_DEPLOY_APPLICATION_ID,
  deployApplicationIdFromToken,
  resolveDeployApplicationIdentity,
  surfaceDeployApplicationIdEnvName,
  withDeployApplicationId,
} from '../src/index.ts'

/** Build a three-part public application token with the given claims. */
function publicToken(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.public`
}

/** Decode the payload of a token built by {@link publicToken}. */
function payloadOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>
}

describe('deployApplicationIdFromToken', () => {
  it('reads the installation id a materialized token carries', () => {
    const token = publicToken({ app_id: '382429273778032640', aud: '382429273778032640' })
    expect(deployApplicationIdFromToken(token)).toBe('382429273778032640')
    expect(DEPLOY_APPLICATION_ID_ENV).toBe('SDKWORK_DEPLOY_APPLICATION_ID')
  })

  it('reports no id for the placeholder, a malformed token, or a payload without one', () => {
    expect(deployApplicationIdFromToken(publicToken({ app_id: PENDING_DEPLOY_APPLICATION_ID }))).toBe('')
    expect(deployApplicationIdFromToken('not-a-token')).toBe('')
    expect(deployApplicationIdFromToken('header.public')).toBe('')
    expect(deployApplicationIdFromToken('header.not-json.public')).toBe('')
    expect(deployApplicationIdFromToken(publicToken({ aud: '1' }))).toBe('')
    expect(deployApplicationIdFromToken('')).toBe('')
  })
})

describe('withDeployApplicationId', () => {
  it('returns an already anchored token unchanged', () => {
    const token = publicToken({ app_id: '382429273778032640', aud: '382429273778032640', session_id: 'bootstrap-382429273778032640' })
    expect(withDeployApplicationId(token, '382429273778032640')).toBe(token)
  })

  it('re-anchors a placeholder token on the id, including the session id it derives', () => {
    const reanchored = withDeployApplicationId(
      publicToken({ app_id: PENDING_DEPLOY_APPLICATION_ID, aud: PENDING_DEPLOY_APPLICATION_ID, session_id: `bootstrap-${PENDING_DEPLOY_APPLICATION_ID}` }),
      '382418217538162688',
    )
    expect(payloadOf(reanchored)).toMatchObject({
      app_id: '382418217538162688',
      aud: '382418217538162688',
      session_id: 'bootstrap-382418217538162688',
    })
  })

  it('rejects a token that is not a three-part public application token', () => {
    expect(() => withDeployApplicationId('one.two', '1')).toThrow(/three-part/u)
    expect(() => withDeployApplicationId('header.not-json.public', '1')).toThrow(/payload is not a JSON object/u)
  })
})

describe('resolveDeployApplicationIdentity', () => {
  const anchoredToken = publicToken({ app_id: '382429273778032640' })

  it('prefers the anchor, then the declared id, then the token claim', () => {
    expect(resolveDeployApplicationIdentity({ anchor: 'anchor', declaredAppId: 'declared', accessToken: anchoredToken }))
      .toEqual({ appId: 'anchor', source: 'anchor' })
    expect(resolveDeployApplicationIdentity({ declaredAppId: 'declared', accessToken: anchoredToken }))
      .toEqual({ appId: 'declared', source: 'declared' })
    expect(resolveDeployApplicationIdentity({ accessToken: anchoredToken }))
      .toEqual({ appId: '382429273778032640', source: 'token' })
  })

  it('never treats an empty or placeholder value as an identity', () => {
    expect(resolveDeployApplicationIdentity({ anchor: ' ', declaredAppId: PENDING_DEPLOY_APPLICATION_ID })).toBeUndefined()
    expect(resolveDeployApplicationIdentity({ declaredAppId: '', accessToken: '' })).toBeUndefined()
    expect(resolveDeployApplicationIdentity({ accessToken: publicToken({ app_id: PENDING_DEPLOY_APPLICATION_ID }) })).toBeUndefined()
  })

  it('lets an anchored token satisfy a profile whose declared id is the placeholder', () => {
    expect(resolveDeployApplicationIdentity({ declaredAppId: PENDING_DEPLOY_APPLICATION_ID, accessToken: anchoredToken }))
      .toEqual({ appId: '382429273778032640', source: 'token' })
  })
})

describe('surfaceDeployApplicationIdEnvName', () => {
  it('derives the surface-scoped variable the materializer reads', () => {
    expect(surfaceDeployApplicationIdEnvName(DEPLOY_APPLICATION_ID_ENV, 'sdkwork-birdcoder2-web-app'))
      .toBe('SDKWORK_DEPLOY_APPLICATION_ID_SDKWORK_BIRDCODER2_WEB_APP')
  })

  it('returns no name without a base variable or a usable surface id', () => {
    expect(surfaceDeployApplicationIdEnvName('', 'sdkwork-birdcoder2-web-app')).toBe('')
    expect(surfaceDeployApplicationIdEnvName(DEPLOY_APPLICATION_ID_ENV, '  ')).toBe('')
    expect(surfaceDeployApplicationIdEnvName(DEPLOY_APPLICATION_ID_ENV, '---')).toBe('')
  })
})
