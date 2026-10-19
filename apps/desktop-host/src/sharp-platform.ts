/** Keep the Linux Electron Host from loading sharp's prebuilt libvips in-process. */
import { registerHooks, type ModuleHooks, type ResolveHookSync } from 'node:module'

/** Platform facts the guard reads, injected so tests need no real Electron process. */
export interface LinuxSharpGuardEnvironment {
  /** Host platform, defaulting to the running process. */
  readonly platform?: NodeJS.Platform
  /** Electron version, defaulting to `process.versions.electron`; undefined means plain Node. */
  readonly electron?: string | undefined
  /** Hook installer, defaulting to `node:module.registerHooks`. */
  readonly register?: (hooks: { resolve: ResolveHookSync }) => Pick<ModuleHooks, 'deregister'>
}

const SHARP_UNAVAILABLE = 'sharp is unavailable in the Linux Electron Host: its prebuilt libvips '
  + 'binds glib symbols that the Electron binary exports, and the first decode crashes the process'

/**
 * Refuse the bare `sharp` specifier and let every other request resolve normally.
 * A consumer that already treats a missing codec as "keep the original" degrades
 * instead of loading the binary, which is the fallback the built-in IM plugin has.
 * @returns Synchronous resolve hook for `registerHooks`.
 */
export function refuseSharp(): ResolveHookSync {
  return (specifier, context, nextResolve) => {
    if (specifier !== 'sharp') return nextResolve(specifier, context)
    const error: NodeJS.ErrnoException = new Error(SHARP_UNAVAILABLE)
    error.code = 'ERR_SHARP_UNAVAILABLE'
    throw error
  }
}

/**
 * Refuse sharp when the Desktop Host runs under the Electron binary on Linux.
 *
 * FORK DIVERGENCE (Linux desktop): the Host is spawned with Electron's executable in
 * RunAsNode mode (`apps/desktop/src/host-process.ts`), so sharp's prebuilt libvips links
 * against the glib symbols that binary exports instead of its own static copy, and the
 * first decode kills the process. The bundled plain Node runtime runs the same prebuilt
 * without that conflict, so the Host refuses the specifier and image consumers keep the
 * original file. Hooks apply to the calling thread only; a worker installs its own.
 * @param environment - Platform facts, injected by tests.
 * @returns Installed resolver for the Host lifetime, or undefined when inapplicable.
 */
export function installLinuxSharpGuard(
  environment: LinuxSharpGuardEnvironment = {},
): Pick<ModuleHooks, 'deregister'> | undefined {
  const platform = environment.platform ?? process.platform
  const electron = 'electron' in environment ? environment.electron : process.versions.electron
  if (platform !== 'linux' || electron === undefined) return undefined
  const register = environment.register ?? registerHooks
  return register({ resolve: refuseSharp() })
}
