/**
 * Desktop host boot: the canonical Web profile plus the desktop overlay
 * settles with the desktop carrier and bridge services, and the shutdown
 * controller disposes the tree. Requires a built workspace (the Loader
 * imports plugin main entries from lib/) — skipped on a clean tree.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  initProfile,
  PROFILE_PATCH_FILENAME,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveProfileDir,
  writeProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import type { ConfigurableProviderView } from '@deepseek-ai/dsh-host-apiproxy/api'
import { InProcessApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { DesktopBridgeHost } from '@deepseek-ai/dsh-client-connection/desktop'
import type { DesktopWebServer } from '@deepseek-ai/dsh-host-desktop-carrier'
import { launchWebScaffold } from '../../web/tests/scaffold.ts'
import {
  bootDesktopHost,
  DESKTOP_OVERLAY_BUNDLE,
  PROFILE_NAME,
  resolveTelemetryPatch,
} from '../src/host.ts'

const WORKSPACE_BUILT = existsSync(fileURLToPath(new URL('../../cli/lib/bin.js', import.meta.url)))
const maybeDescribe = WORKSPACE_BUILT ? describe : describe.skip

const SDKWORK_MANIFEST = JSON.stringify({
  schemaVersion: 3,
  app: { key: 'sdkwork-birdcoder', name: 'SDKWork Birdcoder', appType: 'APP_REACT' },
  backend: {
    appId: 'sdkwork-birdcoder',
    tenantId: '100001',
    organizationId: '0',
    accessTokenPermissionScope: ['iam.users.read'],
  },
})

let home: string | undefined
let credentialEnvironment: { ref: string; value: string | undefined } | undefined

afterEach(async () => {
  if (home !== undefined) rmSync(home, { recursive: true, force: true })
  home = undefined
  if (credentialEnvironment !== undefined) {
    if (credentialEnvironment.value === undefined) Reflect.deleteProperty(process.env, credentialEnvironment.ref)
    else process.env[credentialEnvironment.ref] = credentialEnvironment.value
  }
  credentialEnvironment = undefined
})

function stageHome(): string {
  home = mkdtempSync(join(tmpdir(), 'dsh-desktop-host-'))
  return home
}

/** Unwrap one successful unary RPC and fail with the Host diagnostic otherwise. */
function valueOf<T>(response: {
  result: { ok: true; value: T } | { ok: false; error: { message: string } }
}): T {
  if (!response.result.ok) throw new Error(response.result.error.message)
  return response.result.value
}

/** Build an API client over the loopback-normalized request the Electron IPC handler forwards. */
function desktopApi(bridge: DesktopBridgeHost): InProcessApiClient {
  return new InProcessApiClient({
    fetch: (input, init) => {
      const source = new URL(input instanceof Request ? input.url : String(input))
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
      headers.set('host', '127.0.0.1')
      return bridge.fetch(new Request(`http://127.0.0.1${source.pathname}${source.search}`, {
        ...init,
        headers,
      }))
    },
  })
}

/** Build the same protocol client over the real HTTP carrier bound by the Web scaffold. */
function webApi(baseUrl: string): InProcessApiClient {
  return new InProcessApiClient({
    fetch: (input, init) => {
      const source = new URL(input instanceof Request ? input.url : String(input))
      return fetch(new URL(`${source.pathname}${source.search}`, baseUrl), init)
    },
  })
}

/** Settings UI packages advertised to the renderer, excluding desktop-only shell additions. */
function settingsClientPackages(ctx: Context): string[] {
  const modules = ctx.get('clientModules') as unknown as {
    graph(): { entries: readonly { id: string }[] }
  }
  return modules.graph().entries
    .map(entry => entry.id)
    .filter(id => id.startsWith('@deepseek-ai/dsh-client-ui-settings'))
    .sort()
}

/** Namespaces that back the shipped plugin and model configuration surfaces. */
function configurationNamespaces(namespaces: readonly { ns: string }[]): string[] {
  const expected = new Set(['shell', 'agent-loop', 'web-search-deepseek', 'llm-deepseek', 'llm-pi-ai'])
  return namespaces.map(namespace => namespace.ns).filter(ns => expected.has(ns)).sort()
}

function providerDirectoryById(providers: readonly ConfigurableProviderView[]): ConfigurableProviderView[] {
  return [...providers].sort((left, right) => left.provider < right.provider ? -1 : left.provider > right.provider ? 1 : 0)
}

maybeDescribe('bootDesktopHost', () => {
  it('materializes the bootstrap access token into the launch environment snapshot', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'dsh-desktop-sdkwork-'))
    writeFileSync(join(repo, 'sdkwork.app.config.json'), SDKWORK_MANIFEST)
    const harnessHome = stageHome()
    const prevProfile = process.env.SDKWORK_PROFILE_ID
    const prevToken = process.env.SDKWORK_ACCESS_TOKEN
    try {
      Reflect.deleteProperty(process.env, 'SDKWORK_ACCESS_TOKEN')
      process.env.SDKWORK_PROFILE_ID = 'standalone.development'
      const { ctx, shutdown } = await bootDesktopHost({
        home: harnessHome,
        cwd: repo,
        sdkworkEnv: 'development',
      })
      try {
        const token = ctx.launchEnvironment?.get('SDKWORK_ACCESS_TOKEN')?.value.trim()
        expect(token).toBeTruthy()
      } finally {
        await shutdown.shutdown(0)
      }
    } finally {
      rmSync(repo, { recursive: true, force: true })
      if (prevProfile === undefined) Reflect.deleteProperty(process.env, 'SDKWORK_PROFILE_ID')
      else process.env.SDKWORK_PROFILE_ID = prevProfile
      if (prevToken === undefined) Reflect.deleteProperty(process.env, 'SDKWORK_ACCESS_TOKEN')
      else process.env.SDKWORK_ACCESS_TOKEN = prevToken
    }
  })

  it('boots the Web profile with the desktop carrier and bridge services', async () => {
    const harnessHome = stageHome()
    const envName = 'DESKTOP_EXPLICIT_HOME_SPEC'
    writeFileSync(join(harnessHome, '.env'), `${envName}=shared-home\n`)
    const { ctx, shutdown } = await bootDesktopHost({ home: harnessHome })
    try {
      const carrier = ctx.get('webServer') as unknown as DesktopWebServer
      expect(typeof carrier.dispatch).toBe('function')
      expect(ctx.get('desktopBridge')).toBeDefined()
      expect(ctx.get('connection')).toBeDefined()
      // Settings and credentials are resolved from the same launcher-owned
      // data root as the desktop profile, matching the npx/web composition.
      const settings = ctx.get('settings') as { documentPath: string }
      expect(settings.documentPath).toBe(join(harnessHome, 'settings.yaml'))
      expect(ctx.launchEnvironment?.get(envName)).toEqual({
        value: 'shared-home',
        source: 'user-env',
        path: join(harnessHome, '.env'),
      })
      // The shipped preset roster is assembled into the agent-presets row, so
      // the web composition's `default: standard` resolves (session creation
      // depends on it) and the discovery root list carries a system root.
      const agentPresets = ctx.get('agentPresets') as { roots: readonly { path: string; trust: string }[] }
      expect(agentPresets.roots.some(root =>
        root.trust === 'system' && root.path.includes('agent-presets'),
      )).toBe(true)
      // The boot manifest rides the carrier's index taps on the real dist.
      const clientModules = ctx.get('clientModules') as unknown as {
        graph(): { entries: readonly { id: string }[] }
      }
      expect(clientModules.graph().entries.map(entry => entry.id)).toContain(
        '@deepseek-ai/dsh-client-ui-token-plan',
      )
      const index = await carrier.dispatch(new Request('http://dsh.internal/index.html'))
      expect((await index.text())).toContain('window.__DSH_BOOT__')
    } finally {
      await shutdown.shutdown(0)
      Reflect.deleteProperty(process.env, envName)
    }
  })

  it('initializes and preserves the canonical Web profile manifest', async () => {
    const { shutdown } = await bootDesktopHost({ home: stageHome() })
    try {
      const manifest = JSON.parse(
        readFileSync(join(home as string, 'profiles', PROFILE_NAME, 'package.json'), 'utf8'),
      ) as { dsh: { profile: { bundles: string[] } } }
      expect(PROFILE_NAME).toBe('web')
      expect(manifest.dsh.profile.bundles).toEqual([...PROFILE_TEMPLATES.web ?? []])
      expect(manifest.dsh.profile.bundles).not.toContain(DESKTOP_OVERLAY_BUNDLE)
    } finally {
      await shutdown.shutdown(0)
    }
  })

  it('loads profile-installed plugins and the same Web profile patch without persisting the desktop overlay', async () => {
    const harnessHome = stageHome()
    const profileDir = resolveProfileDir('web', harnessHome)
    initProfile(profileDir, PROFILE_TEMPLATES.web ?? [])
    const packageName = 'profile-addon'
    const packageDir = join(profileDir, 'node_modules', packageName)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: packageName,
      version: '0.0.0',
      type: 'module',
      main: './index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    writeFileSync(join(packageDir, 'index.js'), [
      "export const name = 'profile-addon'",
      'export function apply(ctx, config) {',
      "  ctx.provide('profileAddonProof', config.value)",
      '}',
      '',
    ].join('\n'))
    writeFileSync(join(packageDir, 'cordis.patch.yml'), [
      '- insert:',
      '    - id: profile-addon',
      `      name: '${packageName}'`,
      '      config:',
      '        value: bundle-default',
      '',
    ].join('\n'))
    const manifest = readProfileManifest('test', profileDir)
    writeProfileManifest(profileDir, {
      ...manifest,
      dependencies: { ...manifest.dependencies, [packageName]: '0.0.0' },
      dsh: {
        ...manifest.dsh,
        profile: {
          ...manifest.dsh?.profile,
          bundles: [...manifest.dsh?.profile?.bundles ?? [], packageName],
        },
      },
    })
    writeFileSync(join(profileDir, PROFILE_PATCH_FILENAME), [
      '- id: profile-addon',
      '  config:',
      '    value: web-profile-patch',
      '',
    ].join('\n'))

    const { ctx, shutdown } = await bootDesktopHost({ home: harnessHome })
    try {
      expect(ctx.get('profileAddonProof')).toBe('web-profile-patch')
      expect(readProfileManifest('test', profileDir).dsh?.profile?.bundles).toEqual([
        ...PROFILE_TEMPLATES.web ?? [],
        packageName,
      ])
    } finally {
      await shutdown.shutdown(0)
    }
  })

  it('shares plugin, model, and credential configuration bidirectionally with Web', async () => {
    const harnessHome = stageHome()
    const credentialRef = 'DSH_CARRIER_SHARED_API_KEY_TEST'
    const desktopSecret = 'sk-test-desktop-to-web'
    const webSecret = 'sk-test-web-to-desktop'
    const firstBaseUrl = 'https://desktop-config.example/v1'
    const secondBaseUrl = 'https://web-config.example/v1'
    const expectedNamespaces = ['agent-loop', 'llm-deepseek', 'llm-pi-ai', 'shell', 'web-search-deepseek']
    const originalCredential = process.env[credentialRef]
    credentialEnvironment = { ref: credentialRef, value: originalCredential }
    Reflect.deleteProperty(process.env, credentialRef)

    let desktopSettingsPackages: string[] = []
    let desktopNamespaces: string[] = []
    let desktopProviders: ConfigurableProviderView[] = []
    const firstDesktop = await bootDesktopHost({ home: harnessHome })
    try {
      const bridge = firstDesktop.ctx.get('desktopBridge') as unknown as DesktopBridgeHost
      const api = desktopApi(bridge)
      const described = valueOf(await api.settings.describe({}))
      expect(configurationNamespaces(described.namespaces)).toEqual(expectedNamespaces)
      desktopNamespaces = described.namespaces.map(namespace => namespace.ns).sort()
      desktopSettingsPackages = settingsClientPackages(firstDesktop.ctx)
      expect(desktopSettingsPackages).toEqual([
        '@deepseek-ai/dsh-client-ui-settings',
        '@deepseek-ai/dsh-client-ui-settings-menu',
        '@deepseek-ai/dsh-client-ui-settings-models',
        '@deepseek-ai/dsh-client-ui-settings-plugin-inventory',
        '@deepseek-ai/dsh-client-ui-settings-plugins',
      ])
      desktopProviders = providerDirectoryById(valueOf(await api.llm.providers({})).providers)

      valueOf(await api.settings.mutate({
        ns: 'shell',
        ops: [{ op: 'set', path: ['timeoutMs'], value: 12_345 }],
      }))
      valueOf(await api.settings.mutate({
        ns: 'llm-deepseek',
        ops: [
          { op: 'set', path: ['apiKeyEnv'], value: credentialRef },
          { op: 'set', path: ['baseURL'], value: firstBaseUrl },
        ],
      }))
      valueOf(await api.credentials.set({ ref: credentialRef, value: desktopSecret }))
    } finally {
      await firstDesktop.shutdown.shutdown(0)
    }

    const firstSettingsDocument = readFileSync(join(harnessHome, 'settings.yaml'), 'utf8')
    expect(firstSettingsDocument).toContain(`apiKeyEnv: ${credentialRef}`)
    expect(firstSettingsDocument).not.toContain(desktopSecret)
    expect(readFileSync(join(harnessHome, '.credentials.yaml'), 'utf8')).toContain(desktopSecret)

    const web = await launchWebScaffold({ harnessHome, deepSeekMissingCredential: true })
    try {
      const api = webApi(web.baseUrl)
      const described = valueOf(await api.settings.describe({}))
      expect(configurationNamespaces(described.namespaces)).toEqual(expectedNamespaces)
      expect(described.namespaces.map(namespace => namespace.ns).sort()).toEqual(desktopNamespaces)
      expect(settingsClientPackages(web.ctx)).toEqual(desktopSettingsPackages)
      expect(providerDirectoryById(valueOf(await api.llm.providers({})).providers)).toEqual(desktopProviders)
      expect(described.namespaces.find(namespace => namespace.ns === 'shell')?.user)
        .toMatchObject({ timeoutMs: 12_345 })
      expect(described.namespaces.find(namespace => namespace.ns === 'llm-deepseek')?.user)
        .toMatchObject({ apiKeyEnv: credentialRef, baseURL: firstBaseUrl })
      expect(valueOf(await api.credentials.describe({ refs: [credentialRef] })).credentials[credentialRef])
        .toEqual({ configured: true, source: 'file', writable: true })

      valueOf(await api.settings.mutate({
        ns: 'agent-loop',
        ops: [{ op: 'set', path: ['maxParallelToolCalls'], value: 7 }],
      }))
      valueOf(await api.settings.mutate({
        ns: 'llm-deepseek',
        ops: [{ op: 'set', path: ['baseURL'], value: secondBaseUrl }],
      }))
      valueOf(await api.credentials.set({ ref: credentialRef, value: webSecret }))
    } finally {
      await web.close()
    }

    const finalSettingsDocument = readFileSync(join(harnessHome, 'settings.yaml'), 'utf8')
    expect(finalSettingsDocument).toContain(`apiKeyEnv: ${credentialRef}`)
    expect(finalSettingsDocument).not.toContain(desktopSecret)
    expect(finalSettingsDocument).not.toContain(webSecret)
    const finalCredentialsDocument = readFileSync(join(harnessHome, '.credentials.yaml'), 'utf8')
    expect(finalCredentialsDocument).not.toContain(desktopSecret)
    expect(finalCredentialsDocument).toContain(webSecret)

    const secondDesktop = await bootDesktopHost({ home: harnessHome })
    try {
      const bridge = secondDesktop.ctx.get('desktopBridge') as unknown as DesktopBridgeHost
      const api = desktopApi(bridge)
      const described = valueOf(await api.settings.describe({}))
      expect(configurationNamespaces(described.namespaces)).toEqual(expectedNamespaces)
      expect(described.namespaces.map(namespace => namespace.ns).sort()).toEqual(desktopNamespaces)
      expect(settingsClientPackages(secondDesktop.ctx)).toEqual(desktopSettingsPackages)
      expect(described.namespaces.find(namespace => namespace.ns === 'agent-loop')?.user)
        .toMatchObject({ maxParallelToolCalls: 7 })
      expect(described.namespaces.find(namespace => namespace.ns === 'llm-deepseek')?.user)
        .toMatchObject({ apiKeyEnv: credentialRef, baseURL: secondBaseUrl })
      expect(valueOf(await api.credentials.describe({ refs: [credentialRef] })).credentials[credentialRef])
        .toEqual({ configured: true, source: 'file', writable: true })
    } finally {
      await secondDesktop.shutdown.shutdown(0)
    }
  }, 120_000)
})

describe('resolveTelemetryPatch', () => {
  it('keeps the desktop overlay outside the canonical Web profile template', () => {
    expect(PROFILE_NAME).toBe('web')
    expect(DESKTOP_OVERLAY_BUNDLE).toBe('@deepseek-ai/dsh-desktop-app')
    expect(PROFILE_TEMPLATES.web).not.toContain(DESKTOP_OVERLAY_BUNDLE)
  })

  it('disables the telemetry row on ANY non-empty value and no-ops otherwise', () => {
    expect(resolveTelemetryPatch('1', true)).toEqual({ id: 'session-telemetry-otel', disabled: true })
    expect(resolveTelemetryPatch('0', true)).toEqual({ id: 'session-telemetry-otel', disabled: true })
    expect(resolveTelemetryPatch(undefined, true)).toBeUndefined()
    expect(resolveTelemetryPatch('', true)).toBeUndefined()
    expect(resolveTelemetryPatch('1', false)).toBeUndefined()
  })
})
