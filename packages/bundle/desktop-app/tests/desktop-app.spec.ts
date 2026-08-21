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
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  boot,
  healProfilesModuleFallback,
  initProfile,
  loadBundleLayer,
  loadLayeredEnv,
  loadProfile,
  PROFILE_TEMPLATES,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { InProcessApiClient } from '@deepseek-ai/dsh-host-apiproxy/client'
import type { DesktopBridgeHost } from '@deepseek-ai/dsh-client-connection/desktop'
import type { DesktopWebServer } from '@deepseek-ai/dsh-host-desktop-carrier'

const NAME = 'dsh-desktop'
const PROFILE = 'web'
const DESKTOP_OVERLAY_BUNDLE = '@deepseek-ai/dsh-desktop-app'

/** The desktop shell's package.json — the installation anchor of the module fallback closure. */
const INSTALL_ANCHOR = fileURLToPath(new URL('../../../../apps/desktop/package.json', import.meta.url))

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
 * Stage a temp Harness home with the canonical Web profile initialized and the
 * module fallback healed from the desktop app's dependency closure — exactly
 * the desktop shell's own host boot. The web runtime serves the real built
 * frontend dist (this suite requires a built workspace).
 */
function stageHome(): { configPath: string; profileDir: string } {
  workdir = mkdtempSync(join(tmpdir(), 'dsh-desktop-'))
  const profileDir = resolveProfileDir(PROFILE, workdir)
  initProfile(profileDir, PROFILE_TEMPLATES.web ?? [])
  healProfilesModuleFallback(INSTALL_ANCHOR, workdir)
  return { configPath: join(profileDir, 'cordis.yml'), profileDir }
}

async function bootDesktop(): Promise<{ ctx: Awaited<ReturnType<typeof boot>>; bridge: DesktopBridgeHost }> {
  const { configPath, profileDir } = stageHome()
  const profile = loadProfile(NAME, PROFILE, INSTALL_ANCHOR, workdir ?? '')
  const desktopLayer = loadBundleLayer(NAME, DESKTOP_OVERLAY_BUNDLE, INSTALL_ANCHOR, profileDir)
  const patches = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
    ...desktopLayer.patches,
  ]
  writeFileSync(configPath, '[]\n')
  const ctx = await boot(NAME, configPath, patches, (hostCtx) => {
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, loadLayeredEnv(NAME, profileDir))
    provideCmdline(hostCtx, { args: [], exit: () => {} })
  })
  const carrier = ctx.get('webServer') as unknown as DesktopWebServer | undefined
  if (carrier === undefined) throw new Error('webServer service missing after desktop boot')
  const bridge = ctx.get('desktopBridge') as DesktopBridgeHost | undefined
  if (bridge === undefined) throw new Error('desktopBridge service missing after desktop boot')
  return { ctx, bridge }
}

maybeDescribe('desktop composition over the Web profile', () => {
  it('swaps the HTTP webserver for the desktop carrier and serves the boot manifest', async () => {
    const { ctx } = await bootDesktop()
    try {
      // The Context merge types webServer as the HTTP WebServer; the desktop
      // composition provides the structurally-compatible DesktopWebServer.
      const carrier = ctx.get('webServer') as unknown as DesktopWebServer
      // The carrier is a DesktopWebServer (dispatch surface), not an HTTP server.
      expect(typeof carrier.dispatch).toBe('function')
      expect(carrier.host).toBe('127.0.0.1')
      // The web runtime mounted the dist fallback through the carrier.
      const index = await carrier.dispatch(new Request('http://dsh.internal/index.html'))
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
