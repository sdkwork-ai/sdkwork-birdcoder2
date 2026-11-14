/**
 * Real-composition test for the desktop surface: boot the canonical Web
 * profile plus the in-memory dsh-desktop-app overlay through the Loader,
 * exactly as the desktop shell's host boot does, and assert the carrier swap
 * holds — the webServer service is the desktop carrier, the desktop bridge serves the /api
 * gateway over its fetch handler, the boot manifest rides the index taps, and
 * the desktop-surface prompt replaces the web-surface one.
 *
 * The Loader imports plugin main entries from their built `lib/`, so this
 * suite requires a built workspace (`pnpm run build`) and self-skips on a
 * clean tree — the same contract as the keyless snapshot lanes.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  boot,
  createRuntimeResolution,
  initProfile,
  loadBundleLayer,
  loadLayeredEnv,
  loadProfile,
  PluginPackages,
  resolveProfileDir,
  type ProfileContext,
} from '@deepseek-ai/dsh-app-boot'
import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-official-bundles'
import type { Context } from '@deepseek-ai/cordis'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { apply as applyDesktopAuthentication, inject as desktopAuthenticationInject } from '@deepseek-ai/dsh-host-authentication-desktop'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { InProcessApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { DesktopBridgeHost } from '@deepseek-ai/dsh-sdkwork-api-gateway/desktop'
import type { DesktopWebServer } from '@deepseek-ai/dsh-sdkwork-desktop-carrier'

const NAME = 'dsh-desktop'
const PROFILE = 'web'
const DESKTOP_OVERLAY_BUNDLE = '@deepseek-ai/dsh-sdkwork-desktop-app'

/** The dsh CLI's package.json — the installation anchor the shipped desktop
 * Host boots with (profile-boot's own INSTALL_ANCHOR); its dependency closure
 * carries every bundle the desktop composition mounts, including the web-app
 * bundle the shell itself does not declare. */
const INSTALL_ANCHOR = fileURLToPath(new URL('../../../../apps/cli/package.json', import.meta.url))

let workdir: string | undefined

afterEach(async () => {
  if (workdir !== undefined) rmSync(workdir, { recursive: true, force: true })
  workdir = undefined
})

/** The built-workspace marker the Loader-composition suite needs. */
const WORKSPACE_BUILT = existsSync(
  fileURLToPath(new URL('../../../../apps/cli/lib/bin.js', import.meta.url)),
)

/** Skip the Loader-composition suite on a clean tree (built lib/ required). */
const maybeDescribe = WORKSPACE_BUILT ? describe : describe.skip

/**
 * Stage a temp Harness home with the canonical Web profile initialized —
 * exactly the desktop shell's own host boot. Profile resolution is
 * runtime-only (the module-fallback link farm is gone), so initialization is
 * all the staging a profile needs. The web runtime serves the real built
 * frontend dist (this suite requires a built workspace).
 */
async function stageHome(): Promise<{ configPath: string; profileDir: string }> {
  workdir = mkdtempSync(join(tmpdir(), 'dsh-desktop-'))
  const profileDir = resolveProfileDir(PROFILE, workdir)
  initProfile(profileDir, PROFILE_TEMPLATES.web?.bundles ?? [])
  return { configPath: join(profileDir, 'cordis.yml'), profileDir }
}

async function bootDesktop(): Promise<{ ctx: Awaited<ReturnType<typeof boot>>; bridge: DesktopBridgeHost; desktopSecret: string }> {
  const { configPath, profileDir } = await stageHome()
  const profile = loadProfile(NAME, PROFILE, INSTALL_ANCHOR, workdir ?? '')
  const desktopLayer = loadBundleLayer(NAME, DESKTOP_OVERLAY_BUNDLE, INSTALL_ANCHOR, profileDir)
  const patches = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
    ...desktopLayer.patches,
  ]
  writeFileSync(configPath, '[]\n')
  // Mirror the shell's host boot: the runtime resolution installs the module
  // interception the loader's bare imports consult (profile-boot mounts
  // PluginPackages with the resolution computed from the installation anchor —
  // here the desktop shell's own manifest), and the profileContext gates every
  // `!!js` row that switches on the launching surface (the settings rows the
  // desktop profile needs are disabled without it).
  const resolution = await createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, profile })
  const profileContext: ProfileContext = {
    name: NAME,
    dir: profileDir, patchPath: configPath,
    installAnchor: INSTALL_ANCHOR,
    startedBundles: profile.layers.map(layer => layer.packageName),
    cwd: process.cwd(), home: workdir ?? '',
    overlays: [], telemetryDisabledEnv: process.env.DSH_TELEMETRY_DISABLED,
  }
  // The launcher `ready` signal is deliberately absent: Profile HMR fails fast
  // without it (the desktop shell's client-plugin HMR is a later milestone —
  // rebuild + window reload today), and a provided-but-uncommitted readiness
  // would deadlock the boot against the commit that only follows settlement.
  // The launcher `ready` signal is deliberately absent: Profile HMR fails fast
  // without it (the desktop shell's client-plugin HMR is a later milestone —
  // rebuild + window reload today), and a provided-but-uncommitted readiness
  // would deadlock the boot against the commit that only follows settlement.
  const desktopSecret = 'A'.repeat(43)
  const ctx = await boot(NAME, configPath, patches, async (hostCtx) => {
    hostCtx.provide('profileContext', profileContext)
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, loadLayeredEnv(NAME, profileDir))
    await hostCtx.plugin(PluginPackages, { resolution })
    await hostCtx.plugin({
      inject: desktopAuthenticationInject,
      apply: (scope: Context) => applyDesktopAuthentication(scope, { readSecret: () => desktopSecret }),
    })
    provideCmdline(hostCtx, { args: [], exit: () => {} })
  }, pathToFileURL(join(profileDir, 'package.json')).href)
  const carrier = ctx.get('webServer') as unknown as DesktopWebServer | undefined
  if (carrier === undefined) throw new Error('webServer service missing after desktop boot')
  const bridge = ctx.get('desktopBridge') as DesktopBridgeHost | undefined
  if (bridge === undefined) throw new Error('desktopBridge service missing after desktop boot')
  return { ctx, bridge, desktopSecret }
}

maybeDescribe('desktop composition over the Web profile', () => {
  // A real harness boot (plugin tree, credential init, and the IAM
  // bootstrap's offline fetch retry) exceeds the 5s default on loaded
  // Windows gate machines; these are integration tests, not unit tests.
  vi.setConfig({ testTimeout: 120_000 })
  it('swaps the HTTP webserver for the desktop carrier and serves the boot manifest', async () => {
    const { ctx, desktopSecret } = await bootDesktop()
    try {
      // The Context merge types webServer as the HTTP WebServer; the desktop
      // composition provides the structurally-compatible DesktopWebServer.
      const carrier = ctx.get('webServer') as unknown as DesktopWebServer
      // The carrier is a DesktopWebServer (dispatch surface), not an HTTP server.
      expect(typeof carrier.dispatch).toBe('function')
      expect(carrier.host).toBe('127.0.0.1')
      // The web runtime mounted the dist fallback through the carrier. The
      // dispatch presents the desktop-session credential the shell's forwarded
      // requests carry (the dist fallback's index requires an authenticated
      // peer).
      const index = await carrier.dispatch(new Request('http://dsh.internal/index.html', {
        headers: { cookie: `dsh-desktop-session=${desktopSecret}` },
      }))
      expect(index.status).toBe(200)
      const html = await index.text()
      // The real built frontend shell is served.
      expect(html).toContain('<div id="root">')
      // client-modules' index tap injected the boot manifest into the page.
      expect(html).toContain('globalThis["__DSH_BOOT__"] = ')
      expect(html).toContain('"entries"')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('serves RPC over the desktop bridge with gateway semantics', async () => {
    const { ctx, bridge } = await bootDesktop()
    try {
      const client = new InProcessApiClient({
        fetch: (input, init) => bridge.fetch(new Request(input, init)),
      })
      const response = await client.host.describe({})
      expect(response.result.ok).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('replaces the web-surface prompt with the desktop surface', async () => {
    const { ctx } = await bootDesktop()
    try {
      interface PromptAssembly {
        sections: { name: string; text: string }[]
      }
      const systemPrompt = ctx.get('systemPrompt') as { assemble(): Promise<PromptAssembly> } | undefined
      expect(systemPrompt).toBeDefined()
      const assembly = await systemPrompt?.assemble()
      expect(assembly).toBeDefined()
      for (const row of ctx.loader.entries()) {
        if (String(row.options.name ?? row.options.id).includes('sdkwork-desktop-app')) {
          console.log('DIAG row:', row.options.id, '| name:', row.options.name, '| fiber:', row.fiber === undefined ? 'none' : row.fiber.state)
        }
      }
      console.log('DIAG sections:', JSON.stringify((assembly as PromptAssembly).sections.map(s => s.name)))
      const names = (assembly as PromptAssembly).sections.map(section => section.name)
      expect(names).toContain('app:desktop-surface')
      expect(names).toContain('harness:source')
      expect(names).not.toContain('app:web-surface')
      const desktop = (assembly as PromptAssembly).sections.find(section => section.name === 'app:desktop-surface')
      expect(desktop?.text).toContain('desktop application')
      expect(desktop?.text).not.toContain('http://')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('provides the connection host service and opens event streams through the bridge', async () => {
    const { ctx, bridge } = await bootDesktop()
    try {
      expect(ctx.get('connection')).toBeDefined()
      const controller = new AbortController()
      const iterator = bridge.openMux(controller.signal)[Symbol.asyncIterator]()
      const pending = iterator.next()
      // A live subscription is established; aborting ends the stream cleanly.
      controller.abort()
      await pending.then(() => undefined, () => undefined)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
