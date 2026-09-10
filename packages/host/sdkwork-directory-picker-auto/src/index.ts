/**
 * SDKWork adaptive chooser of the directory-picker seam — the fork counterpart
 * of upstream's `directory-picker-auto`. Same boot-time resolution (bind host,
 * SSH launch, display session, Linux chooser binary — reusing the upstream
 * resolver verbatim), different native arm: an attended host mounts the
 * SDKWork **composed** backend, whose capability serves the native OS chooser
 * AND the browse primitives from one `ctx.directoryPicker`. That keeps the
 * desktop's OS workspace dialog while the governed filesystem read/write wire
 * verbs stay available to in-app surfaces (the ui-sdkwork-explorer file tabs,
 * the workspace directory browser). Remote/headless resolutions still mount
 * the plain browse backend exactly as upstream does — nothing renders on the
 * host display there, and the chooser has nothing to add.
 * @module @deepseek-ai/dsh-sdkwork-directory-picker-auto
 */

import type { Context } from '@deepseek-ai/cordis'
// Empty type imports carry the `loader` and `webServer` Context merges for the reads below.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { launchedThroughSsh, launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import {
  canExecute, hasLinuxChooserBinary,
  resolveDirectoryPickerBackend,
  type DirectoryPickerBackendKind,
} from '@deepseek-ai/dsh-host-directory-picker-auto'

export { canExecute, hasLinuxChooserBinary, resolveDirectoryPickerBackend } from '@deepseek-ai/dsh-host-directory-picker-auto'
export type { DirectoryPickerBackendKind, DirectoryPickerEnv, DirectoryPickerHostFacts } from '@deepseek-ai/dsh-host-directory-picker-auto'

/** Cordis plugin name. */
export const name = 'sdkwork-directory-picker-auto'
/** Required services: the effective bind host (`webServer`) and the entry tree the backend mounts into (`loader`). */
export const inject = ['webServer', 'loader']

/**
 * Host backend package per resolved kind — fixed composition vocabulary, not
 * a tunable. The native arm mounts the SDKWork composed backend (never the
 * plain native one: a desktop boot must keep serving the governed browse
 * verbs). Exported because the reference is a runtime string the static
 * config gate cannot see in a yml row: `verify-cordis-config` requires every
 * app composing this chooser to declare the values as dependencies.
 */
export const BACKEND_PACKAGES: Record<DirectoryPickerBackendKind, string> = {
  native: '@deepseek-ai/dsh-sdkwork-directory-picker-composed',
  browse: '@deepseek-ai/dsh-host-directory-picker-browse',
}

/**
 * Client surface package per resolved kind, mounted with its backend so one
 * resolved interaction still composes both faces. The native arm keeps the
 * native surface: on an attended host the workspace picker stays the OS
 * dialog, while the browse wire verbs serve in-app surfaces regardless.
 */
export const SURFACE_PACKAGES: Record<DirectoryPickerBackendKind, string> = {
  native: '@deepseek-ai/dsh-client-ui-directory-picker-native',
  browse: '@deepseek-ai/dsh-client-ui-directory-picker-browse',
}

/**
 * Resolve the interaction from one boot-time sample and mount its backend and
 * surface as Loader entries; the effect's disposer removes both entries and
 * joins their fibers' teardown, so unloading this plugin returns only after
 * both faces of the mounted interaction (and their dependents) quiesced.
 * @param ctx - cordis context carrying the injected `webServer` and `loader`.
 */
export async function apply(ctx: Context): Promise<void> {
  const backend = resolveDirectoryPickerBackend({
    bindHost: ctx.webServer.host,
    platform: process.platform,
    ssh: launchedThroughSsh(launchEnvironmentOf(ctx)),
    env: process.env,
    linuxChooser: hasLinuxChooserBinary(process.env.PATH, canExecute),
  })
  await ctx.effect(async () => {
    // Root-tree create: the Loader root is in-memory (write() is a no-op), so
    // the mounted rows can never be persisted back into a config file. The
    // backend lands first: the surface's browser half drives the capability
    // the backend registers.
    const ids: string[] = []
    const unmount = async () => {
      for (const id of [...ids].reverse()) {
        // Tree teardown (group.stop) can have removed the entry already;
        // nothing is left to unmount or await then.
        if (ctx.loader.store[id] === undefined) continue
        // remove() disposes the entry transactionally, so the chooser's unload
        // signals completion only after that face quiesced.
        await ctx.loader.remove(id)
      }
    }
    try {
      for (const name of [BACKEND_PACKAGES[backend], SURFACE_PACKAGES[backend]]) {
        ids.push(await ctx.loader.create({ name }))
      }
    } catch (cause) {
      // Setup owns the entries it created until it returns the disposer: leaving
      // the backend mounted would make a retry collide with its own
      // directoryPicker registration.
      await unmount()
      throw cause
    }
    return unmount
  }, 'sdkwork-directory-picker-auto: interaction entries')
}
