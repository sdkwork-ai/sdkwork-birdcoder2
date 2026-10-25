/**
 * Project app state (`projectApp`): the manifest identity a create draft is
 * built from, the recorded deploy app that turns creation off, and the
 * manifest-vocabulary → console-card mapping.
 */
import { describe, expect, it } from 'vitest'

import {
  hasProjectApp,
  projectAppCardId,
  projectAppDraft,
  readProjectAppState,
  type ProjectAppIdentity,
} from '../src/client/projectApp.ts'

/** One v3 manifest with the identity fields under test. */
function manifest(app: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    schemaVersion: 3,
    kind: 'agent.app',
    app,
    runtime: { family: 'web', framework: 'react' },
    publish: { platforms: ['WEB'] },
    ...extra,
  }, null, 2)}\n`
}

/** Identity literal with just the card signals the case needs. */
function identity(overrides: Partial<ProjectAppIdentity>): ProjectAppIdentity {
  return { platforms: [], ...overrides }
}

describe('readProjectAppState', () => {
  it('reports an absent or broken manifest as unlinked with no identity', () => {
    expect(readProjectAppState(undefined, {})).toEqual({ hasManifest: false })
    expect(readProjectAppState('', { directory: '/w/app' })).toEqual({ hasManifest: false, directory: '/w/app' })
    expect(readProjectAppState('not json {', {})).toEqual({ hasManifest: false })
    expect(readProjectAppState('[]', {})).toEqual({ hasManifest: false })
  })

  it('reads the governed identity and the recorded linkage together', () => {
    const raw = manifest({
      key: 'sdkwork-store',
      name: 'SDKWork Store',
      displayName: 'SDKWork 商店',
      description: 'Everything store.',
      appType: 'APP_REACT',
      officialWebsiteUrl: 'https://sdkwork.com/apps/store',
      iconUrl: 'https://cdn.sdkwork.com/store.png',
    }, {
      metadata: {
        publishing: { appIdByTarget: { 'standalone.development': 'app-uuid-1' }, birdcoder: { appName: 'SDKWork Store' } },
      },
    })
    const state = readProjectAppState(raw, { directory: '/w/store', profileId: 'standalone.development' })
    expect(state.hasManifest).toBe(true)
    expect(state.directory).toBe('/w/store')
    expect(state.profileId).toBe('standalone.development')
    expect(state.linkedAppId).toBe('app-uuid-1')
    expect(state.link?.appName).toBe('SDKWork Store')
    expect(state.identity).toEqual({
      appKey: 'sdkwork-store',
      appName: 'SDKWork Store',
      displayName: 'SDKWork 商店',
      description: 'Everything store.',
      appType: 'APP_REACT',
      runtimeFamily: 'web',
      runtimeFramework: 'react',
      platforms: ['WEB'],
      iconUrl: 'https://cdn.sdkwork.com/store.png',
      officialWebsiteUrl: 'https://sdkwork.com/apps/store',
    })
  })

  it('reads the primary media icon when app.iconUrl is absent, and tolerates an app-less manifest', () => {
    const raw = manifest({ key: 'k', name: 'n', displayName: 'd' }, {
      media: { icons: { primary: { url: 'https://cdn.sdkwork.com/icon.png' } } },
    })
    expect(readProjectAppState(raw, {}).identity?.iconUrl).toBe('https://cdn.sdkwork.com/icon.png')
    const appLess = JSON.stringify({ schemaVersion: 3, kind: 'agent.app' })
    expect(readProjectAppState(appLess, {}).identity).toBeUndefined()
  })

  it('keeps an unlinked project unlinked', () => {
    expect(readProjectAppState(manifest({ key: 'k', name: 'n' }), {}).linkedAppId).toBeUndefined()
  })

  it('omits every absent identity field instead of writing undefined members', () => {
    const raw = JSON.stringify({ schemaVersion: 3, kind: 'agent.app', app: { key: 'only-key' }, publish: {} })
    const state = readProjectAppState(raw, {})
    expect(state.identity).toEqual({ appKey: 'only-key', platforms: [] })
    expect(state.hasManifest).toBe(true)
    expect(state.link).toBeUndefined()
    expect(state.profileId).toBeUndefined()
    expect(state.directory).toBeUndefined()
    // An app object without `key` still yields the fields it does carry.
    expect(readProjectAppState(JSON.stringify({
      schemaVersion: 3,
      kind: 'agent.app',
      app: { name: 'No Key' },
    }), {}).identity).toEqual({ appName: 'No Key', platforms: [] })
  })

  it('reads an app.iconUrl that overrides a primary media icon and drops a missing website', () => {
    const raw = manifest({
      key: 'k',
      iconUrl: 'https://cdn.sdkwork.com/app.png',
    }, { media: { icons: { primary: { url: 'https://cdn.sdkwork.com/media.png' } } } })
    const identity = readProjectAppState(raw, {}).identity
    expect(identity?.iconUrl).toBe('https://cdn.sdkwork.com/app.png')
    expect(identity?.officialWebsiteUrl).toBeUndefined()
  })
})

describe('projectAppDraft', () => {
  it('prefers the display name and carries the manifest identity', () => {
    const state = readProjectAppState(manifest({
      key: 'sdkwork-store',
      name: 'SDKWork Store',
      displayName: 'SDKWork 商店',
      description: 'Everything store.',
      appType: 'APP_REACT',
    }), {})
    expect(projectAppDraft(state, 'fallback-dir')).toEqual({
      name: 'SDKWork 商店',
      cardId: 'pc-web',
      description: 'Everything store.',
      appKey: 'sdkwork-store',
    })
  })

  it('falls back to app.name, then the directory name, and omits an undeterminable card', () => {
    const named = readProjectAppState(manifest({ key: 'k', name: 'Named App' }), {})
    expect(projectAppDraft(named, 'fallback-dir')).toEqual({ name: 'Named App', cardId: 'pc-web', appKey: 'k' })
    const bare = readProjectAppState(JSON.stringify({ schemaVersion: 3, kind: 'agent.app' }), {})
    expect(projectAppDraft(bare, 'fallback-dir')).toEqual({ name: 'fallback-dir' })
  })
})

describe('projectAppCardId', () => {
  it('returns undefined without an identity', () => {
    expect(projectAppCardId(undefined)).toBeUndefined()
  })

  it('maps server roots and HarmonyOS roots', () => {
    expect(projectAppCardId(identity({ runtimeFamily: 'server' }))).toBe('api-service')
    expect(projectAppCardId(identity({ appType: 'APP_HARMONY' }))).toBe('harmonyos')
    expect(projectAppCardId(identity({ runtimeFamily: 'mobile', runtimeFramework: 'harmony-native' }))).toBe('harmonyos')
  })

  it('maps mini-program roots, including uni-app roots delivering MP platforms', () => {
    expect(projectAppCardId(identity({ runtimeFamily: 'mini-program' }))).toBe('mini-program')
    expect(projectAppCardId(identity({ appType: 'APP_UNIAPP', platforms: ['MP_WEIXIN'] }))).toBe('mini-program')
    expect(projectAppCardId(identity({ appType: 'APP_UNIAPP', platforms: ['H5'] }))).toBeUndefined()
    expect(projectAppCardId(identity({ appType: 'APP_UNIAPP', platforms: ['MP'] }))).toBe('mini-program')
  })

  it('maps desktop roots', () => {
    expect(projectAppCardId(identity({ runtimeFamily: 'desktop', runtimeFramework: 'electron' }))).toBe('desktop')
  })

  it('maps mobile roots by native framework or single delivery platform', () => {
    expect(projectAppCardId(identity({ runtimeFamily: 'mobile', runtimeFramework: 'android-native' }))).toBe('android')
    expect(projectAppCardId(identity({ runtimeFamily: 'mobile', runtimeFramework: 'ios-native' }))).toBe('ios')
    expect(projectAppCardId(identity({ runtimeFamily: 'mobile', runtimeFramework: 'flutter', platforms: ['APP_ANDROID'] }))).toBe('android')
    expect(projectAppCardId(identity({ runtimeFamily: 'mobile', runtimeFramework: 'flutter', platforms: ['APP_IOS'] }))).toBe('ios')
    expect(projectAppCardId(identity({ runtimeFamily: 'mobile', runtimeFramework: 'flutter', platforms: ['APP_IOS', 'APP_ANDROID'] }))).toBeUndefined()
    expect(projectAppCardId(identity({ runtimeFamily: 'mobile', runtimeFramework: 'flutter' }))).toBeUndefined()
    expect(projectAppCardId(identity({ appType: 'APP_FLUTTER', platforms: ['APP_ANDROID'] }))).toBe('android')
  })

  it('maps web roots by framework and declared platforms', () => {
    expect(projectAppCardId(identity({ runtimeFamily: 'web', runtimeFramework: 'static-html', platforms: ['WEB'] }))).toBe('static-web')
    expect(projectAppCardId(identity({ runtimeFamily: 'web', platforms: ['H5'] }))).toBe('h5')
    expect(projectAppCardId(identity({ runtimeFamily: 'web', platforms: ['H5', 'WEB'] }))).toBe('pc-web')
    expect(projectAppCardId(identity({ runtimeFamily: 'web', platforms: ['WEB'] }))).toBe('pc-web')
    expect(projectAppCardId(identity({ runtimeFamily: 'web' }))).toBe('pc-web')
    expect(projectAppCardId(identity({ appType: 'APP_REACT' }))).toBe('pc-web')
    expect(projectAppCardId(identity({ appType: 'APP_VUE', platforms: ['H5'] }))).toBe('h5')
    expect(projectAppCardId(identity({ appType: 'APP_HTML' }))).toBe('pc-web')
  })

  it('leaves unknown roots undetermined', () => {
    expect(projectAppCardId(identity({ runtimeFamily: 'library' }))).toBeUndefined()
    expect(projectAppCardId(identity({ appType: 'APP_UNITY', platforms: ['APP_ANDROID'] }))).toBeUndefined()
  })
})

describe('hasProjectApp', () => {
  it('is true only when the manifest records an app id', () => {
    expect(hasProjectApp({ hasManifest: true, linkedAppId: 'app-1' })).toBe(true)
    expect(hasProjectApp({ hasManifest: true })).toBe(false)
  })
})
