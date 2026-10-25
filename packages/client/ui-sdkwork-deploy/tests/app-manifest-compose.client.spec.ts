/**
 * Creation-time manifest authoring (`composeAppManifest`): every type card
 * composes a complete APP_MANIFEST_SPEC v3 manifest whose runtime identity is
 * the spec's client-architecture alignment, the written manifest reads back
 * as the same type card (`projectAppCardId` round trip), the linkage patch
 * lands under the canonical profile, and an existing manifest is only
 * merged — never rewritten.
 */
import { describe, expect, it } from 'vitest'
import { appKeyOf, composeAppManifest, runtimeIdentityOf } from '../src/client/appManifestCompose.ts'
import { mergeDeployLink } from '../src/client/deployAppConfig.ts'
import { projectAppCardId, readProjectAppState } from '../src/client/projectApp.ts'

const PROFILE = { profileId: 'standalone.development' }

const PATCH = {
  appId: 'app-uuid-1',
  appName: 'Nova',
  appSlug: 'nova',
  sourceDirectory: '/w/nova',
}

/** Per-type expectations: the composed runtime identity and the read-back card. */
const CARD_EXPECTATIONS: readonly {
  readonly cardId: string
  readonly family: string
  readonly framework: string
  readonly platforms: readonly string[]
  readonly appType: string
}[] = [
  { cardId: 'h5', family: 'mobile', framework: 'react-h5', platforms: ['H5'], appType: 'APP_REACT' },
  { cardId: 'pc-web', family: 'web', framework: 'react', platforms: ['WEB'], appType: 'APP_REACT' },
  { cardId: 'desktop', family: 'desktop', framework: 'electron', platforms: ['DESKTOP_WINDOWS'], appType: 'APP_REACT' },
  { cardId: 'mini-program', family: 'mini-program', framework: 'weixin-mini-program', platforms: ['MP_WEIXIN'], appType: 'APP_UNIAPP' },
  { cardId: 'android', family: 'mobile', framework: 'android-native', platforms: ['APP_ANDROID'], appType: 'NONE' },
  { cardId: 'ios', family: 'mobile', framework: 'ios-native', platforms: ['APP_IOS'], appType: 'NONE' },
  { cardId: 'harmonyos', family: 'mobile', framework: 'harmony-native', platforms: ['APP_HARMONY'], appType: 'APP_HARMONY' },
  { cardId: 'api-service', family: 'server', framework: 'node-service', platforms: ['API'], appType: 'NONE' },
  { cardId: 'static-web', family: 'web', framework: 'static-html', platforms: ['WEB'], appType: 'APP_HTML' },
]

/** The creation identity for one card (what the flows hand the writer). */
function identityFor(cardId: string): {
  name: string
  displayName: string
  description: string
  appSlug: string
  cardId: string
} {
  return {
    name: 'Nova',
    displayName: 'Nova 应用',
    description: 'Everything store.',
    appSlug: 'nova',
    cardId,
  }
}

describe('composeAppManifest', () => {
  for (const expected of CARD_EXPECTATIONS) {
    it(`composes a complete spec manifest for the ${expected.cardId} card that reads back as the same card`, () => {
      const text = composeAppManifest(undefined, PATCH, identityFor(expected.cardId), PROFILE)
      const manifest = JSON.parse(text) as Record<string, unknown>
      // Canonical skeleton: every required section of the standard.
      for (const section of ['app', 'backend', 'runtime', 'media', 'publish', 'artifacts', 'release', 'security']) {
        expect(manifest[section], section).toBeTypeOf('object')
      }
      expect(manifest['schemaVersion']).toBe(3)
      expect(manifest['kind']).toBe('agent.app')
      expect(manifest['metadata']).toMatchObject({
        deploymentConfig: 'etc/sdkwork.deployment.config.json',
      })
      const app = manifest['app'] as Record<string, unknown>
      expect(app).toMatchObject({
        key: 'nova',
        name: 'Nova',
        displayName: 'Nova 应用',
        description: 'Everything store.',
        appType: expected.appType,
      })
      const runtime = manifest['runtime'] as Record<string, unknown>
      expect(runtime).toMatchObject({
        family: expected.family,
        framework: expected.framework,
        supportedDeploymentProfiles: ['standalone'],
        defaultDeploymentProfile: 'standalone',
      })
      expect(manifest['publish']).toMatchObject({ platforms: expected.platforms })
      const release = manifest['release'] as { notes: { version: string; current: boolean; packageIds: string[] }[] }
      expect(release.notes).toHaveLength(1)
      expect(release.notes[0]).toMatchObject({ version: '0.1.0', current: true, packageIds: [] })
      // The linkage lands under the canonical profile with the fork provenance.
      const metadata = manifest['metadata'] as Record<string, unknown>
      expect(metadata['publishing']).toMatchObject({
        appIdByTarget: { 'standalone.development': 'app-uuid-1' },
        birdcoder: { appId: 'app-uuid-1', appName: 'Nova', sourceDirectory: '/w/nova' },
      })
      // Round trip: the written manifest resolves the same console type card.
      const state = readProjectAppState(text, { profileId: 'standalone.development' })
      expect(projectAppCardId(state.identity)).toBe(expected.cardId)
    }, 30000)
  }

  it('records the product icon at both icon slots when the created app carries one', () => {
    const text = composeAppManifest(undefined, PATCH, {
      ...identityFor('pc-web'),
      iconUrl: 'https://cdn.test/nova-icon.png',
    }, PROFILE)
    const manifest = JSON.parse(text) as Record<string, unknown>
    expect(manifest['app']).toMatchObject({ iconUrl: 'https://cdn.test/nova-icon.png' })
    const media = manifest['media'] as {
      icons: { primary: Record<string, unknown>; platform: unknown[] }
      screenshots: unknown[]
      previews: unknown[]
    }
    expect(media.icons.primary).toMatchObject({
      id: 'nova-primary-icon',
      type: 'ICON',
      purpose: 'PRIMARY',
      url: 'https://cdn.test/nova-icon.png',
    })
    expect(media.icons.platform).toEqual([])
    expect(media.screenshots).toEqual([])
    expect(media.previews).toEqual([])
  }, 30000)

  it('records the official website only when the caller truthfully knows one', () => {
    const composed = JSON.parse(
      composeAppManifest(undefined, PATCH, { ...identityFor('pc-web'), officialWebsiteUrl: 'https://nova.example.com' }, PROFILE),
    ) as { app: Record<string, unknown> }
    expect(composed.app['officialWebsiteUrl']).toBe('https://nova.example.com')
    const without = JSON.parse(
      composeAppManifest(undefined, PATCH, identityFor('pc-web'), PROFILE),
    ) as { app: Record<string, unknown> }
    expect(without.app['officialWebsiteUrl']).toBeUndefined()
  }, 30000)

  it('falls back to the app kind when no card is derivable', () => {
    expect(runtimeIdentityOf({ name: 'Nova', appKind: 'HARMONYOS_APP' })).toEqual({
      family: 'mobile',
      framework: 'harmony-native',
      platforms: ['APP_HARMONY'],
      appType: 'APP_HARMONY',
    })
    expect(runtimeIdentityOf({ name: 'Nova', appKind: 'API_SERVICE' })).toMatchObject({ family: 'server', platforms: ['API'] })
    const text = composeAppManifest(undefined, PATCH, { name: 'Nova', appSlug: 'nova', appKind: 'SPA_WEB' }, PROFILE)
    const state = readProjectAppState(text, { profileId: 'standalone.development' })
    expect(projectAppCardId(state.identity)).toBe('pc-web')
  }, 30000)

  it('derives the immutable app key: governed key, then kebab of the name, then the slug', () => {
    expect(appKeyOf({ name: 'Nova Store', appKey: 'governed-key' })).toBe('governed-key')
    expect(appKeyOf({ name: 'Nova Store' })).toBe('nova-store')
    expect(appKeyOf({ name: '商城运营台', appSlug: 'store-console' })).toBe('store-console')
    expect(appKeyOf({ name: '商城运营台' })).toBe('app')
  }, 30000)

  it('merges into an existing manifest without rewriting its sections', () => {
    const existing = JSON.stringify({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { key: 'legacy', name: 'Legacy', displayName: 'Legacy', appType: 'APP_VUE', officialWebsiteUrl: 'https://legacy.example.com' },
      runtime: { family: 'web', framework: 'vue', supportedDeploymentProfiles: ['standalone', 'cloud'], defaultDeploymentProfile: 'cloud' },
      metadata: { deploymentConfig: 'etc/sdkwork.deployment.config.json' },
    })
    const text = composeAppManifest(existing, PATCH, identityFor('pc-web'), PROFILE)
    const manifest = JSON.parse(text) as Record<string, unknown>
    // Every authored section survives verbatim; only the linkage block lands.
    expect(manifest['app']).toMatchObject({ key: 'legacy', appType: 'APP_VUE' })
    expect(manifest['runtime']).toMatchObject({ family: 'web', defaultDeploymentProfile: 'cloud' })
    expect(manifest['media']).toBeUndefined()
    expect(manifest['metadata']).toMatchObject({ deploymentConfig: 'etc/sdkwork.deployment.config.json' })
    expect((manifest['metadata'] as Record<string, unknown>)['publishing'])
      .toMatchObject({ appIdByTarget: { 'standalone.development': 'app-uuid-1' } })
  }, 30000)

  it('rebuilds a damaged file as a complete manifest instead of failing the write', () => {
    const text = composeAppManifest('{ not json', PATCH, identityFor('desktop'), PROFILE)
    const manifest = JSON.parse(text) as Record<string, unknown>
    expect(manifest['schemaVersion']).toBe(3)
    expect(manifest['runtime']).toMatchObject({ family: 'desktop', framework: 'electron' })
    expect((manifest['metadata'] as Record<string, unknown>)['publishing'])
      .toMatchObject({ appIdByTarget: { 'standalone.development': 'app-uuid-1' } })
  }, 30000)

  it('composes the bare canonical skeleton when the caller passes no identity', () => {
    const text = composeAppManifest(undefined, PATCH, undefined, PROFILE)
    const manifest = JSON.parse(text) as Record<string, unknown>
    expect(manifest['app']).toMatchObject({ key: 'app', name: 'app', appType: 'APP_REACT' })
    expect(manifest['publish']).toMatchObject({ platforms: ['WEB', 'H5'] })
  }, 30000)

  it('stays link-compatible with the direct merge helper for existing manifests', () => {
    const existing = JSON.stringify({ schemaVersion: 3, kind: 'agent.app' })
    expect(
      composeAppManifest(existing, PATCH, identityFor('pc-web'), PROFILE),
    ).toBe(mergeDeployLink(existing, PATCH, PROFILE))
  }, 30000)
})
