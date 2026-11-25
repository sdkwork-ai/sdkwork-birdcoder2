// @vitest-environment jsdom
/**
 * The conversation publish executor's reported failures: the paths decided
 * before any network call, and the version rule.
 */
import { describe, expect, it } from 'vitest'
import type { DeployHost } from '../src/client/deployHost.ts'
import { defaultSiteHostname, isSemver, publishFromConversation } from '../src/client/deployConversation.ts'

/** Ports over a Host double. */
function ports(host: Partial<DeployHost>, signedIn = true): { host: DeployHost; isSignedIn: () => boolean } {
  return {
    host: { readCurrentUser: () => undefined, ...host } as DeployHost,
    isSignedIn: () => signedIn,
  }
}

describe('publishFromConversation', () => {
  it('refuses to publish without a signed-in IAM session', async () => {
    const result = await publishFromConversation(ports({}, false), {})
    expect(result).toEqual({
      ok: false,
      status: 'failed',
      stage: 'signedOut',
      code: 'SIGNED_OUT',
      message: expect.stringContaining('Sign in'),
    })
  })

  it('refuses to publish without a project directory', async () => {
    const result = await publishFromConversation(ports({ readDefaultDirectory: () => undefined }), {})
    expect(result).toMatchObject({ ok: false, stage: 'resolveProject', code: 'NO_PROJECT' })
  })

  it('refuses to publish a project with no governed manifest', async () => {
    const result = await publishFromConversation(ports({
      readDefaultDirectory: () => 'D:/work/store',
      readProjectApp: async () => ({ hasManifest: false }),
    }), {})
    expect(result).toMatchObject({ ok: false, stage: 'resolveProject', code: 'NO_MANIFEST' })
  })

  it('refuses to guess an application type the manifest does not determine', async () => {
    const result = await publishFromConversation(ports({
      readDefaultDirectory: () => 'D:/work/store',
      readProjectApp: async () => ({ hasManifest: true, identity: { platforms: [] } }),
    }), {})
    expect(result).toMatchObject({ ok: false, stage: 'resolveApp', code: 'APP_TYPE_AMBIGUOUS' })
  })

  it('accepts plain semantic versions only', () => {
    expect(isSemver('0.1.0')).toBe(true)
    expect(isSemver(' 2.10.3 ')).toBe(true)
    expect(isSemver('next')).toBe(false)
    expect(isSemver('1.0')).toBe(false)
  })

  it('derives the default app domain from the platform label and suffix catalog', () => {
    expect(defaultSiteHostname({ appDomainLabel: 'skyline', appDomainSuffixes: ['birdcoder.com'] }))
      .toBe('skyline.app.birdcoder.com')
    expect(defaultSiteHostname({ slug: 'skyline' })).toBe('skyline.birdcoder.com')
    expect(defaultSiteHostname({ appDomainLabel: 'skyline', appDomainSuffixes: [''] })).toBe('skyline.birdcoder.com')
    expect(defaultSiteHostname({})).toBeUndefined()
    expect(defaultSiteHostname({ appDomainLabel: '  ' })).toBeUndefined()
  })
})
