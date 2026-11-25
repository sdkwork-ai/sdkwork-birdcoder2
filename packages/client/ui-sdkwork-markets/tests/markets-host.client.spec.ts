// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

// The embed double records the props this adapter hands the catalog, so a case
// can drive the install port the plugins page receives.
const embed = vi.hoisted(() => ({ props: undefined as unknown }))
const sdkMocks = vi.hoisted(() => ({
  pluginsClient: { plugins: { list: vi.fn(), listCategories: vi.fn() } },
  driveClient: { drive: { nodes: { downloadUrls: { retrieve: vi.fn() } }, downloadPackages: { create: vi.fn() } } },
  tokenManager: {},
  createPluginsAppClient: vi.fn(),
  createDriveAppClient: vi.fn(),
  syncTokens: vi.fn(),
}))

vi.mock('@sdkwork/appstore-pc-embed', () => ({
  AppstoreMarketsSurface: (props: unknown) => {
    embed.props = props
    return null
  },
}))

vi.mock('@sdkwork/plugins-app-sdk', () => ({
  createPluginsAppClient: sdkMocks.createPluginsAppClient.mockReturnValue(sdkMocks.pluginsClient),
}))

vi.mock('@sdkwork/drive-app-sdk', () => ({
  createDriveAppClient: sdkMocks.createDriveAppClient.mockReturnValue(sdkMocks.driveClient),
}))

vi.mock('@deepseek-ai/dsh-client-ui-sdkwork-iam/sdkwork-global-token-manager', () => ({
  getSdkworkGlobalTokenManager: () => sdkMocks.tokenManager,
  syncSdkworkGlobalTokenManager: sdkMocks.syncTokens,
}))

import {
  configureMarketsHost,
  createMarketsHostRuntime,
  marketplaceInstallSpec,
  pinMarketplaceGitSpec,
  MarketsApp,
  pluginsInstallSpec,
  toMarketsSession,
  type MarketsHostEnvironment,
  type MarketsHostIamFace,
  type MarketsHostLocale,
  type MarketsHostTheme,
} from '../src/client/marketsHost.ts'

/** Translate seat double: the dictionary key is its own copy. */
const t = (key: string): string => key

afterEach(() => { cleanup() })

function harness(initial: {
  baseUrl?: string
  accessToken?: string
  session?: Parameters<typeof toMarketsSession>[0]
  language?: string
}) {
  let environmentListener: (() => void) | undefined
  let iamListener: (() => void) | undefined
  let localeListener: (() => void) | undefined
  const env: MarketsHostEnvironment = {
    apiBaseUrl: () => initial.baseUrl ?? 'https://fixture.example',
    accessToken: () => initial.accessToken ?? '',
    subscribe: (listener) => {
      environmentListener = listener
      return () => { environmentListener = undefined }
    },
  }
  const openSignIn = vi.fn()
  const iam: MarketsHostIamFace = {
    controller: {
      getState: () => ({ session: initial.session ?? null }),
      subscribe: (listener) => {
        iamListener = listener
        return () => { iamListener = undefined }
      },
    },
    openSignIn,
  }
  const locale: MarketsHostLocale = {
    getSnapshot: () => ({ active: initial.language ?? 'zh' }),
    subscribe: (listener) => {
      localeListener = listener
      return () => { localeListener = undefined }
    },
  }
  const theme: MarketsHostTheme = {
    getColorScheme: () => 'light',
    subscribe: () => () => {},
  }
  return {
    env, iam, locale, theme, openSignIn,
    fireEnvironment: () => { environmentListener?.() },
    fireIam: () => { iamListener?.() },
    fireLocale: () => { localeListener?.() },
  }
}

describe('toMarketsSession', () => {
  it('maps credentials and user profile, trimming tokens', () => {
    expect(toMarketsSession({
      accessToken: ' access ',
      authToken: 'auth',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
    }, '')).toEqual({
      authToken: 'auth',
      accessToken: 'access',
      refreshToken: 'refresh',
      sessionId: 'session',
      user: { id: 'user', displayName: 'Ada' },
    })
  })

  it('falls back to the static environment token when no IAM session exists', () => {
    expect(toMarketsSession(null, ' static ')).toEqual({ accessToken: 'static' })
  })

  it('returns null when neither session nor static token carries credentials', () => {
    expect(toMarketsSession(null, '')).toBeNull()
    expect(toMarketsSession({ user: { id: 'u' } }, '')).toBeNull()
  })
})

describe('MarketsHostRuntime', () => {
  it('creates Plugins and Drive SDK clients against the active gateway with shared IAM tokens', () => {
    const h = harness({ baseUrl: 'https://gw.example/', accessToken: 'static-token' })
    const adapter = createMarketsHostRuntime(h)
    const marketplace = adapter.getPluginsMarketplaceHost()

    expect(marketplace.client).toBe(sdkMocks.pluginsClient)
    expect(marketplace.canInstall).toBe(true)
    expect(sdkMocks.createPluginsAppClient).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://gw.example/',
      authMode: 'dual-token',
      tokenManager: sdkMocks.tokenManager,
    }))
    expect(sdkMocks.createDriveAppClient).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://gw.example/',
      authMode: 'dual-token',
      tokenManager: sdkMocks.tokenManager,
    }))
    expect(sdkMocks.syncTokens).toHaveBeenCalledWith(null, 'static-token')
    adapter.dispose()
  })

  it('reads the composed snapshot from env, iam, and locale', () => {
    const h = harness({
      baseUrl: 'https://gw.example',
      accessToken: 'static-token',
      session: { accessToken: 'iam-token', user: { id: 'u1' } },
      language: 'zh',
    })
    const runtime = createMarketsHostRuntime(h)
    const snapshot = runtime.getHostSnapshot()
    expect(snapshot.apiBaseUrl).toBe('https://gw.example')
    // An IAM session supersedes the static token (no accessToken prop).
    expect(snapshot.accessToken).toBe('')
    expect(snapshot.session?.accessToken).toBe('iam-token')
    expect(snapshot.locale).toBe('zh-CN')
    expect(snapshot.environmentRevision).toBe(0)
  })

  it('serves the static token when anonymous', () => {
    const h = harness({ baseUrl: 'https://gw.example', accessToken: 'static' })
    const runtime = createMarketsHostRuntime(h)
    runtime.start()
    const snapshot = runtime.getHostSnapshot()
    expect(snapshot.accessToken).toBe('static')
    // With no IAM session the static token rides the session snapshot
    // (toMarketsSession(null, 'static') → { accessToken: 'static' }).
    expect(snapshot.session).toEqual({ accessToken: 'static' })
    runtime.dispose()
  })

  it('caches the snapshot until an input changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    runtime.start()
    const first = runtime.getHostSnapshot()
    expect(runtime.getHostSnapshot()).toBe(first)
    h.fireLocale()
    expect(runtime.getHostSnapshot()).not.toBe(first)
    runtime.dispose()
  })

  it('bumps the environment revision on environment changes', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    runtime.start()
    expect(runtime.getEnvironmentRevision()).toBe(0)
    h.fireEnvironment()
    expect(runtime.getEnvironmentRevision()).toBe(1)
    runtime.dispose()
  })

  it('notifies subscribers and stops after disposal', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    const listener = vi.fn()
    const stop = runtime.start()
    runtime.subscribe(listener)
    h.fireIam()
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    h.fireIam()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reports whether the surface holds credentials to call app-api', () => {
    const anonymous = createMarketsHostRuntime(harness({ baseUrl: 'https://gw.example' }))
    expect(anonymous.getHostSnapshot().authenticated).toBe(false)
    const session = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'iam-token' },
    }))
    expect(session.getHostSnapshot().authenticated).toBe(true)
    // The static environment token authenticates the surface without an IAM
    // session: those deployments keep their catalog and never see the gate.
    const statically = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      accessToken: 'static-token',
    }))
    expect(statically.getHostSnapshot().authenticated).toBe(true)
  })

  it('hands the sign-in gesture to the application login entry', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const runtime = createMarketsHostRuntime(h)
    runtime.requestSignIn()
    expect(h.openSignIn).toHaveBeenCalledOnce()
  })

  it('keys the catalog by the signed-in identity so an account switch remounts it', () => {
    const h = harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'token-a', context: { tenantId: 'tenant', userId: 'user-a' } },
    })
    const runtime = createMarketsHostRuntime(h)
    runtime.start()
    expect(runtime.getIdentityKey()).toBe('tenant:user-a')
    expect(runtime.getHostSnapshot().identityKey).toBe('tenant:user-a')

    h.iam.controller.getState = () => ({
      session: { accessToken: 'token-b', context: { tenantId: 'tenant', userId: 'user-b' } },
    })
    h.fireIam()
    expect(runtime.getIdentityKey()).toBe('tenant:user-b')
    expect(runtime.getHostSnapshot().identityKey).toBe('tenant:user-b')
    expect(runtime.getEnvironmentRevision()).toBe(0)
    runtime.dispose()
  })

  it('falls back to the profile id and reads an anonymous session as no identity', () => {
    const signedIn = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'token', user: { id: 'user-a' }, context: { tenantId: 'tenant' } },
    }))
    expect(signedIn.getIdentityKey()).toBe('tenant:user-a')
    expect(createMarketsHostRuntime(harness({ baseUrl: 'https://gw.example' })).getIdentityKey()).toBe('')
  })
})

describe('pluginsInstallSpec', () => {
  it('preserves git refs and subdirectories for the Host plugin manager', async () => {
    const spec = await pluginsInstallSpec({
      kind: 'git',
      repositoryUrl: 'https://github.com/sdkwork/plugins.git',
      repositoryPath: 'plugins/calendar',
      gitRef: 'v1.2.3',
    }, {} as never)
    expect(spec).toBe('git+https://github.com/sdkwork/plugins.git#v1.2.3&path:/plugins/calendar')
  })

  it('resolves a Drive archive URL and carries its SHA-256 into validation', async () => {
    const checksum = 'a'.repeat(64)
    const download = vi.fn().mockResolvedValue({ signedSourceUrl: 'https://cdn.example.com/calendar.zip' })
    const driveClient = {
      drive: { nodes: { downloadUrls: { retrieve: download } } },
    }
    const spec = await pluginsInstallSpec({
      kind: 'drive_file',
      driveUri: 'drive://spaces/plugins/nodes/calendar-archive',
      checksumSha256: checksum,
    }, driveClient as never)
    expect(download).toHaveBeenCalledWith('calendar-archive')
    expect(spec).toBe(`https://cdn.example.com/calendar.zip#sha256=${checksum}`)
  })

  it('resolves a Drive directory through a download package', async () => {
    const create = vi.fn().mockResolvedValue({ signedSourceUrl: 'https://cdn.example.com/plugins.zip' })
    const driveClient = { drive: { downloadPackages: { create } } }
    const spec = await pluginsInstallSpec({
      kind: 'drive_directory',
      driveUri: 'drive://spaces/plugins/nodes/calendar-directory',
    }, driveClient as never)
    expect(create).toHaveBeenCalledWith({ nodeIds: ['calendar-directory'], packageName: 'sdkwork-plugin.zip' })
    expect(spec).toBe('https://cdn.example.com/plugins.zip')
  })

  it('rejects malformed Drive URIs before calling the Drive SDK', async () => {
    const retrieve = vi.fn()
    await expect(pluginsInstallSpec({
      kind: 'drive_file',
      driveUri: 'https://example.com/file',
      checksumSha256: 'a'.repeat(64),
    }, { drive: { nodes: { downloadUrls: { retrieve } } } } as never)).rejects.toThrow('Plugin Drive source is invalid')
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('rejects a Drive file without a valid checksum before downloading it', async () => {
    const retrieve = vi.fn()
    await expect(pluginsInstallSpec({
      kind: 'drive_file',
      driveUri: 'drive://spaces/plugins/nodes/archive',
      checksumSha256: 'bad-hash',
    }, { drive: { nodes: { downloadUrls: { retrieve } } } } as never)).rejects.toThrow('Plugin artifact checksum is invalid')
    expect(retrieve).not.toHaveBeenCalled()
  })
})

describe('marketplaceInstallSpec', () => {
  it('pins an imported npm entry to the catalog version', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        npmPackage: '@example/dsh-notify',
        version: '1.2.3',
      },
    } as never)).toBe('@example/dsh-notify@1.2.3')
  })

  it('maps the typed SDKWork dsh-market projection without using display install text', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        npmPackage: 'sdkwork-plugin',
        version: '2.0.0',
        install: 'dsh plugin add sdkwork-plugin',
      },
    } as never)).toBe('sdkwork-plugin@2.0.0')
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        repositoryUrl: 'https://github.com/example/plugins.git',
        repositoryPath: 'packages/calendar',
      },
    } as never)).toBe('git+https://github.com/example/plugins.git#HEAD&path:/packages/calendar')
  })

  it('preserves the normalized GitHub ref and package path from the catalog projection', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        repositoryUrl: 'https://github.com/example/plugins',
        repositoryRef: 'v3.1.0',
        repositoryPath: 'packages/calendar',
      },
    } as never)).toBe('git+https://github.com/example/plugins.git#v3.1.0&path:/packages/calendar')
  })

  it('maps a GitHub repository subdirectory to the Harness source spec', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        catalogUrl: 'https://awesome-dsh-plugin.com/p/example/plugins/notify/',
        repositoryUrl: 'https://github.com/example/plugins',
        repositoryPath: 'packages/notify',
      },
    } as never)).toBe('git+https://github.com/example/plugins.git#HEAD&path:/packages/notify')
  })

  it('maps a release archive through the source validator', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        tarball: 'https://github.com/example/notify/releases/download/v1.2.3/notify.tgz',
        repositoryUrl: 'https://github.com/example/notify',
      },
    } as never)).toBe('archive+https://github.com/example/notify/releases/download/v1.2.3/notify.tgz')
  })

  it('does not treat display-only or unsupported metadata as an install target', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        install: 'dsh plugin --profile web add @example/notifier',
        url: 'https://example.com/not-a-plugin-page',
      },
    } as never)).toBeUndefined()
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'other-catalog',
        npm: '@example/notifier',
      },
    } as never)).toBeUndefined()
  })

  it('falls back to a valid repository when an optional tarball is malformed', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        tarballUrl: 'https://example.com/not-a-plugin.txt',
        repositoryUrl: 'https://github.com/example/plugin',
      },
    } as never)).toBe('git+https://github.com/example/plugin.git')
  })

  it('rejects a release archive from a different GitHub repository', () => {
    expect(marketplaceInstallSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        tarballUrl: 'https://github.com/other/plugin/releases/download/v1/plugin.tgz',
        repositoryUrl: 'https://github.com/example/plugin',
      },
    } as never)).toBe('git+https://github.com/example/plugin.git')
  })

  it('runs imported metadata through the existing inspect-and-install store flow', async () => {
    const adapter = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'iam-token' },
    }))
    const store = {
      openInstall: vi.fn(),
      runInstall: vi.fn().mockResolvedValue(undefined),
    }
    await adapter.getPluginsMarketplaceHost().install({
      marketplaceMetadata: {
        provider: 'dsh-market',
        npmPackage: 'sdkwork-plugin',
        version: '2.0.0',
      },
    } as never, store as never)
    expect(store.openInstall).toHaveBeenCalledWith('sdkwork-plugin@2.0.0')
    expect(store.runInstall).toHaveBeenCalledOnce()
    adapter.dispose()
  })

  it('falls back to the imported catalog projection when the record carries no target', async () => {
    const adapter = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'iam-token' },
    }))
    const store = { openInstall: vi.fn(), runInstall: vi.fn().mockResolvedValue(undefined) }
    await adapter.getPluginsMarketplaceHost().install({
      pluginKey: 'dsh-demo',
      marketplaceMetadata: {
        provider: 'dsh-market',
        npmPackage: 'demo-plugin',
        version: '1.0.0',
        catalogUrl: 'https://github.com/example/demo',
      },
    } as never, store as never)
    expect(store.openInstall).toHaveBeenCalledWith('demo-plugin@1.0.0')
    adapter.dispose()
  })

  it('installs the catalog record’s own target', async () => {
    const adapter = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'iam-token' },
    }))
    const store = { openInstall: vi.fn(), runInstall: vi.fn().mockResolvedValue(undefined) }
    await adapter.getPluginsMarketplaceHost().install({
      pluginKey: 'dsh-demo',
      installTarget: { kind: 'registry', spec: 'demo-plugin@4.5.6', packageName: 'demo-plugin', packageVersion: '4.5.6', isDefault: true },
      installTargets: [{ kind: 'registry', spec: 'demo-plugin@4.5.6', packageName: 'demo-plugin', packageVersion: '4.5.6', isDefault: true }],
      marketplaceMetadata: { provider: 'dsh-market', npmPackage: 'demo-plugin', version: '1.0.0' },
    } as never, store as never)
    expect(store.openInstall).toHaveBeenCalledWith('demo-plugin@4.5.6')
    adapter.dispose()
  })

  it('refuses to install a record with no target at all', async () => {
    const adapter = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'iam-token' },
    }))
    const store = { openInstall: vi.fn(), runInstall: vi.fn() }
    await expect(adapter.getPluginsMarketplaceHost().install({
      pluginKey: 'dsh-empty',
      marketplaceMetadata: { provider: 'dsh-market', install: 'dsh plugin add demo' },
    } as never, store as never)).rejects.toMatchObject({ problem: 'no-target' })
    expect(store.openInstall).not.toHaveBeenCalled()
    adapter.dispose()
  })

  it('updates and removes the installed dependency a catalog record names', async () => {
    const adapter = createMarketsHostRuntime(harness({
      baseUrl: 'https://gw.example',
      session: { accessToken: 'iam-token' },
    }))
    const host = adapter.getPluginsMarketplaceHost()
    const store = { updatePlugin: vi.fn().mockResolvedValue(undefined), removePlugin: vi.fn().mockResolvedValue(undefined) }
    const installation = { status: 'update-available' as const, packageName: 'demo-plugin', installedVersion: '1.0.0', version: '1.1.0' }
    await host.update({ pluginKey: 'dsh-demo' } as never, installation, store as never)
    expect(store.updatePlugin).toHaveBeenCalledWith('demo-plugin', '1.1.0')
    await host.remove({ pluginKey: 'dsh-demo' } as never, installation, store as never)
    expect(store.removePlugin).toHaveBeenCalledWith('demo-plugin')
    adapter.dispose()
  })
})

describe('pinMarketplaceGitSpec', () => {
  it('pins a GitHub ref to the commit used by the Harness installer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sha: 'a'.repeat(40) }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(pinMarketplaceGitSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        repositoryUrl: 'https://github.com/example/plugin',
        repositoryRef: 'main',
        repositoryPath: 'packages/plugin',
      },
    } as never, 'git+https://github.com/example/plugin.git#main&path:/packages/plugin')).resolves.toBe(
      `git+https://github.com/example/plugin.git#${'a'.repeat(40)}&path:/packages/plugin`,
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/example/plugin/commits/main',
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }) }),
    )
    vi.unstubAllGlobals()
  })

  it('leaves archive specs unchanged', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(pinMarketplaceGitSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        repositoryUrl: 'https://github.com/example/plugin',
      },
    } as never, 'archive+https://github.com/example/plugin/releases/download/v1/plugin.tgz')).resolves.toBe(
      'archive+https://github.com/example/plugin/releases/download/v1/plugin.tgz',
    )
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('preserves the spec’s own ref and directory instead of re-deriving them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sha: 'b'.repeat(40) }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(pinMarketplaceGitSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        repositoryUrl: 'https://github.com/example/plugin',
        repositoryPath: 'packages/other',
      },
    } as never, 'git+https://github.com/example/plugin.git#v2.1.0&path:/packages/plugin')).resolves.toBe(
      `git+https://github.com/example/plugin.git#${'b'.repeat(40)}&path:/packages/plugin`,
    )
    vi.unstubAllGlobals()
  })

  it('leaves the target unpinned when GitHub ref resolution fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    await expect(pinMarketplaceGitSpec({
      marketplaceMetadata: {
        provider: 'dsh-market',
        repositoryUrl: 'https://github.com/example/plugin',
      },
    } as never, 'git+https://github.com/example/plugin.git')).resolves.toBe(
      'git+https://github.com/example/plugin.git',
    )
    vi.unstubAllGlobals()
  })
})

describe('MarketsApp', () => {
  it('renders the sign-in face while the host holds no credentials', () => {
    const h = harness({ baseUrl: 'https://gw.example' })
    const adapter = configureMarketsHost(h)
    const view = render(createElement(MarketsApp, { page: 'experts', t }))
    expect(view.container.querySelector('[data-markets-auth-required="true"]')).not.toBeNull()
    expect(view.getByText('surface.auth.title')).not.toBeNull()
    expect(view.getByText('surface.auth.detail')).not.toBeNull()
    fireEvent.click(view.getByRole('button', { name: 'surface.auth.action' }))
    expect(h.openSignIn).toHaveBeenCalledOnce()
    // The catalog never mounts for a request that app-api would refuse.
    expect(view.container.querySelector('[data-sdk-surface]')).toBeNull()
    adapter.dispose()
  })

  it('mounts the catalog once the host holds a session', () => {
    const h = harness({ baseUrl: 'https://gw.example', session: { accessToken: 'iam-token' } })
    const adapter = configureMarketsHost(h)
    const view = render(createElement(MarketsApp, { page: 'experts', t }))
    expect(view.container.querySelector('[data-markets-auth-required]')).toBeNull()
    expect(view.container.querySelector('[data-sdk-surface="markets-experts"]')).not.toBeNull()
    adapter.dispose()
  })

  it('keeps the unconfigured face ahead of the sign-in face', () => {
    const adapter = configureMarketsHost(harness({ baseUrl: '' }))
    const view = render(createElement(MarketsApp, { page: 'experts', t }))
    expect(view.container.querySelector('[data-markets-empty="unconfigured"]')).not.toBeNull()
    expect(view.container.querySelector('[data-markets-auth-required]')).toBeNull()
    adapter.dispose()
  })

  it('hands the catalog no plugin install port: the App Store plugin shelf is retired', () => {
    const h = harness({ baseUrl: 'https://gw.example', session: { accessToken: 'iam-token' } })
    const adapter = configureMarketsHost(h)
    render(createElement(MarketsApp, { page: 'experts', t }))
    const props = embed.props as { pluginsHost?: unknown } | undefined
    expect(props?.pluginsHost).toBeUndefined()
    adapter.dispose()
  })
})
