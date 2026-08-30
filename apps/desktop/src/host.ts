/**
 * Boot the harness host tree for the desktop shell: the canonical `web`
 * profile plus an in-memory dsh-sdkwork-desktop-app overlay that swaps the HTTP
 * carrier for Electron IPC. The profile manifest, installed bundles, and
 * user patches are the same ones the `dsh` CLI loads.
 * @module @deepseek-ai/dsh-desktop/host
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FiberState, type Context } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  installFailLoud,
  loadBundleLayer,
  loadLayeredEnv,
  loadOptionalPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  watchUserPatches,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import {
  applySdkworkLaunchEnv,
  ensureSdkworkBootstrapToken,
  materializeEnsuredBootstrapAccessToken,
  type SdkworkLaunchProfile,
} from '@deepseek-ai/dsh-sdkwork-env-bootstrap'
import { createShutdown, type Shutdown } from './shutdown.ts'

/** Diagnostic prefix for boot and fail-loud lines. */
const NAME = 'dsh-desktop'

/** The canonical profile shared by the Web and desktop launchers. */
export const PROFILE_NAME = 'web'

/** Installation-owned transport overlay applied without changing the Web profile manifest. */
export const DESKTOP_OVERLAY_BUNDLE = '@deepseek-ai/dsh-sdkwork-desktop-app'

/** The root config filename inside a profile directory. */
const PROFILE_ROOT_FILENAME = 'cordis.yml'

/** The empty root entry list every profile tree patches over. */
const PROFILE_ROOT_CONFIG = `# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# home-layer patches. Edit cordis.patch.yml, not this file.
[]
`

/** The session-telemetry row id the DSH_TELEMETRY_DISABLED switch targets. */
const TELEMETRY_ROW_ID = 'session-telemetry-otel'

/**
 * The ApiProxy gateway row: the desktop renderer's IpcApiClient speaks the
 * ApiProxy dot-method protocol over the desktop bridge, which the merged Web
 * composition no longer mounts (its browser surface dispatches through the
 * Typert gateway). The desktop shell remounts the gateway beside it.
 */
const DESKTOP_APIPROXY_PATCH: PatchOptions = {
  insert: [{ id: 'api-gateway', name: '@deepseek-ai/dsh-host-apiproxy' }],
}

/** Shipped agent-preset root: beside this app's own config, in both source and built layouts. */
const SHIPPED_PRESET_ROOT = fileURLToPath(new URL('../config/agent-presets/', import.meta.url))

/** Absolute path of this app's package.json (both anchors: src/ and lib/ sit one level under apps/desktop). */
const INSTALL_ANCHOR = fileURLToPath(new URL('../package.json', import.meta.url))

/** Options for {@link bootDesktopHost}. */
export interface DesktopHostOptions {
  /** Harness home override (defaults to {@link resolveDshHome}); tests pass a temp dir. */
  home?: string
  /** Working directory whose `.env` is the project layer (defaults to process.cwd()). */
  cwd?: string
  /** Inner arguments handed to the tree through `ctx.cmdlineArgs` (defaults to none). */
  args?: readonly string[]
  /**
   * The installation anchor for the module fallback closure — the app's own
   * package.json. The desktop shell passes `app.getAppPath()/package.json` so
   * dev and packaged runs heal against the same real installation directory.
   */
  installAnchor?: string
  /**
   * SDKWork gateway profile for this launch. Unpackaged `pnpm desktop:dev`
   * passes `development` (`http://api-dev.birdcoder.com`); a packaged/dist
   * build passes `production` (`https://api.birdcoder.com`). Tests omit this
   * so the supplied `cwd` is used as-is without applying a profile file.
   */
  sdkworkEnv?: SdkworkLaunchProfile
}

/** A settled desktop host tree plus its shutdown controller. */
export interface BootedDesktopHost {
  ctx: Context
  shutdown: Shutdown
}

/**
 * Resolve the telemetry opt-out switch into its boot patch. ANY non-empty
 * value (including `'0'`/`'false'`) disables: a privacy switch prefers
 * off-by-mistake over on-by-mistake.
 * @param disabledEnv - the raw `DSH_TELEMETRY_DISABLED` value (`undefined` when unset).
 * @param hasRow - whether the composition carries the telemetry row.
 * @returns the disable patch, or `undefined` when no hard-disable patch is required.
 */
export function resolveTelemetryPatch(disabledEnv: string | undefined, hasRow: boolean): PatchOptions | undefined {
  if ((disabledEnv ?? '') === '' || !hasRow) return undefined
  return { id: TELEMETRY_ROW_ID, disabled: true }
}

/**
 * Boot the desktop host end to end: load the canonical Web profile, append
 * the installation-owned desktop transport overlay, and return the settled
 * tree. The Web profile manifest and user patches remain the single source
 * for both launchers.
 * @param options - home/cwd/args/sdkworkEnv overrides (tests pass home/cwd and omit sdkworkEnv).
 * @returns the settled root context and the shutdown controller.
 */
export async function bootDesktopHost(options: DesktopHostOptions = {}): Promise<BootedDesktopHost> {
  const home = options.home ?? resolveDshHome()
  const installAnchor = options.installAnchor ?? INSTALL_ANCHOR
  const cwd = options.sdkworkEnv === undefined
    ? options.cwd ?? process.cwd()
    : applySdkworkLaunchEnv({
      cwd: options.cwd ?? process.cwd(),
      profile: options.sdkworkEnv,
      env: process.env,
      warn: line => void process.stderr.write(`${NAME}: ${line}`),
    }).cwd
  // Ensure and materialize the bootstrap token before the frozen launch
  // snapshot: ui-sdkwork-env reads `SDKWORK_ACCESS_TOKEN` from that snapshot, not
  // from post-boot process.env mutations.
  const ensured = await ensureSdkworkBootstrapToken({
    cwd,
    env: process.env,
    warn: line => void process.stderr.write(`${NAME}: ${line}`),
  })
  materializeEnsuredBootstrapAccessToken(ensured, process.env)
  // The frozen environment snapshot, provided before any entry mounts; the
  // layered .env load also materializes unset project/user values.
  const environment = loadLayeredEnv(NAME, cwd, undefined, home)
  await healProfilesModuleFallback({ installAnchor, home })
  // Resolve bundles from the actual installation. In a packaged build this is
  // resources/app/package.json; in development it is apps/desktop/package.json.
  // Using the module-relative anchor here would make a caller-provided anchor
  // (and therefore the packaged dependency closure) ineffective.
  const profile = loadProfile(NAME, PROFILE_NAME, installAnchor, home)
  const desktopLayer = loadBundleLayer(NAME, DESKTOP_OVERLAY_BUNDLE, installAnchor, profile.dir)
  const homePatches = loadOptionalPatches(NAME, join(home, PROFILE_PATCH_FILENAME)) ?? []
  const sharedPatches = [
    ...profile.layers.flatMap(layer => layer.patches),
    ...profile.patches,
    ...homePatches,
  ]
  const desktopPatches = desktopLayer.patches
  const composed = composeEntries([
    sharedPatches,
    desktopPatches,
  ])
  const rows = new Map<string, PatchOptions>()
  for (const entry of composed) {
    if (typeof entry.id === 'string') rows.set(entry.id, entry)
  }
  const telemetryPatch = resolveTelemetryPatch(process.env.DSH_TELEMETRY_DISABLED, rows.has(TELEMETRY_ROW_ID))
  const overlays: PatchOptions[] = telemetryPatch === undefined ? [] : [telemetryPatch]
  overlays.push(DESKTOP_APIPROXY_PATCH)
  // The shipped preset roster is an assembly fact of this app: it sits beside
  // the app's own config (the CLI's shipped root is apps/cli's — this app
  // must carry its own or the web composition's `default: standard` resolves
  // nothing and every session creation fails).
  //
  // The plugin's own shipped root is switched OFF, so THIS directory is the
  // only system root rather than one of two. Two system roots do not merge by
  // id alone: every id the plugin's `presets/` also supplies is shadowed
  // here (first root wins), and every id only one of the two supplies stays —
  // which is how the roster once offered the SAME capability twice, once
  // under the plugin's `ptc` and once under this directory's stale `code`
  // copy of it. One root makes the roster a directory listing with no
  // shadowing rule to reason about; `config/agent-presets` is kept in step
  // with the plugin's presets by the desktop parity test.
  if (rows.has('agent-presets')) {
    overlays.push({
      id: 'agent-presets',
      config: {
        ...(rows.get('agent-presets')?.config ?? {}) as Record<string, unknown>,
        includeShippedRoot: false,
        roots: [{ path: SHIPPED_PRESET_ROOT, trust: 'system' }],
      },
    })
  }
  const patches: PatchOptions[] = [
    ...sharedPatches,
    ...desktopPatches,
    ...overlays,
  ]
  const rootConfig = join(profile.dir, PROFILE_ROOT_FILENAME)
  // The root is always rewritten: the whole composition is patch layers, and
  // the vendored Loader's tree write-back could otherwise bake composed rows
  // into this file (duplicating every bundle insert on the next boot).
  writeFileSync(rootConfig, PROFILE_ROOT_CONFIG)

  const app: { current?: Context } = {}
  const shutdown = createShutdown(async () => { await app.current?.fiber.dispose() })
  installFailLoud(NAME, process, async () => { await app.current?.fiber.dispose() })
  // Include applies id-targeted patches in place; keep the source layer graph
  // pristine so the live watcher can rebuild the exact bundle defaults later.
  const ctx = await boot(NAME, rootConfig, structuredClone(patches), (hostCtx) => {
    app.current = hostCtx
    // Before any config-tree entry mounts, so plugins resolve all launch-time
    // environment values from the same immutable provenance snapshot.
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
    provideCmdline(hostCtx, {
      args: options.args ?? [],
      exit: code => void shutdown.shutdown(code),
    })
  }, pathToFileURL(join(profile.dir, 'package.json')).href, (...segments: string[]) => join(home, ...segments))
  app.current = ctx

  // The desktop bundle intentionally disables module HMR, but configuration
  // patches still have the same live-update contract as `dsh web`. Compose
  // fresh copies of every layer so removing a user override restores the
  // bundle value instead of leaving a previous in-memory patch behind.
  if (ctx.fiber.state === FiberState.ACTIVE && ctx.get('loader') !== undefined) {
    const composeLive = (): PatchOptions[] => structuredClone([
      ...profile.layers.flatMap(layer => layer.patches),
      ...loadOptionalPatches(NAME, profile.patchPath) ?? [],
      ...loadOptionalPatches(NAME, join(home, PROFILE_PATCH_FILENAME)) ?? [],
      ...desktopPatches,
      ...overlays,
    ])
    try {
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: profile.patchPath,
        compose: composeLive,
      })
      await watchUserPatches(ctx, {
        binName: NAME,
        filename: join(home, PROFILE_PATCH_FILENAME),
        compose: composeLive,
      })
    } catch (error) {
      await ctx.fiber.dispose()
      throw error
    }
  }
  return { ctx, shutdown }
}
