/**
 * SDKWork launch environment for the Desktop Host process.
 *
 * The Desktop carrier owns the same two steps the `dsh` CLI launcher performs
 * before it freezes the launch snapshot: apply the deployment's SDKWork
 * identity, gateway URL, and bootstrap credential, then hand the resolved
 * project directory to `loadLayeredEnv`. Without them the carrier's index
 * injection carries no SDKWork environment at all, so every embedded platform
 * surface (App Store catalog, Drive, IAM) starts on the schema's build-time
 * gateway default and with no access token.
 *
 * FORK DIVERGENCE: upstream Desktop inherits whatever the shell exported;
 * the fork matches the CLI launcher instead.
 * @module @deepseek-ai/dsh-desktop-host/launch-environment
 */

import type { SdkworkLaunchProfile } from '@deepseek-ai/dsh-sdkwork-env-bootstrap'
import {
  applySdkworkLaunchEnv,
  ensureSdkworkBootstrapToken,
  markInjectedSdkworkEnv,
  materializeEnsuredBootstrapAccessToken,
  resolveSdkworkLaunchProfile,
} from '@deepseek-ai/dsh-sdkwork-env-bootstrap'

/**
 * Environment variable through which a launcher declares the tier itself
 * instead of the source-checkout test. `desktop:prod` sets it to
 * `production`: without it, its profile directory sits inside the checkout and
 * the test resolves development, discarding the production selection the
 * launcher composed.
 */
export const DESKTOP_SDKWORK_PROFILE_VARIABLE = 'DSH_DESKTOP_SDKWORK_PROFILE'

/** Options for {@link applyDesktopLaunchEnvironment}. */
export interface ApplyDesktopLaunchEnvironmentOptions {
  /**
   * The Host's invoking directory — the Desktop profile directory, which for
   * `pnpm dev:desktop` sits inside the source checkout and for an installed
   * application inside the user's home.
   */
  readonly cwd: string
  /** Mutable launch environment; the caller passes `process.env`. */
  readonly env: Record<string, string | undefined>
  /** Sink for one-line diagnostics; defaults to stderr. */
  readonly warn?: (line: string) => void
}

/** Facts the Host entry needs after preparing its launch environment. */
export interface DesktopLaunchEnvironment {
  /**
   * Directory whose `.env` is the project layer: the source-checkout root when
   * one encloses {@link ApplyDesktopLaunchEnvironmentOptions.cwd}, the invoking
   * directory otherwise.
   */
  readonly cwd: string
}

/**
 * Resolve the tier the Host applies. A {@link DESKTOP_SDKWORK_PROFILE_VARIABLE}
 * value of `production` declares the online-debug tier and wins over the
 * source-checkout test; an unset variable keeps the test (a checkout resolves
 * development, everything else production). Any other value is a
 * misconfiguration and fails the launch.
 * @param env - the launch environment carrying the declaration.
 * @param cwd - the invoking directory the checkout test examines.
 * @returns the launch profile `applySdkworkLaunchEnv` applies.
 */
export function resolveDesktopLaunchProfile(
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): SdkworkLaunchProfile {
  const declared = env[DESKTOP_SDKWORK_PROFILE_VARIABLE]?.trim()
  if (declared === undefined || declared === '') return resolveSdkworkLaunchProfile(cwd)
  if (declared !== 'production') {
    throw new Error(`desktop host: ${DESKTOP_SDKWORK_PROFILE_VARIABLE} must be "production" or unset; got "${declared}"`)
  }
  return 'production'
}

/**
 * Apply the SDKWork launch environment and ensure the bootstrap token.
 *
 * The source-checkout test inside `applySdkworkLaunchEnv` is what selects the
 * lifecycle by default: a profile directory inside a checkout resolves
 * development (the tracked `.env.standalone.development` supplies the local
 * gateway), while an installed application's home directory resolves
 * production. A launcher-exported {@link DESKTOP_SDKWORK_PROFILE_VARIABLE}
 * overrides that test, which is how `desktop:prod` keeps its production
 * selection from being re-resolved back onto the checkout's development tier.
 * @param options - invoking directory, mutable environment, and diagnostic sink.
 * @returns the project directory `loadLayeredEnv` must treat as its project layer.
 */
export async function applyDesktopLaunchEnvironment(
  options: ApplyDesktopLaunchEnvironmentOptions,
): Promise<DesktopLaunchEnvironment> {
  const { cwd } = applySdkworkLaunchEnv({
    cwd: options.cwd,
    profile: resolveDesktopLaunchProfile(options.env, options.cwd),
    env: options.env,
    ...options.warn === undefined ? {} : { warn: options.warn },
  })
  materializeEnsuredBootstrapAccessToken(
    await ensureSdkworkBootstrapToken({
      cwd,
      env: options.env,
      ...options.warn === undefined ? {} : { warn: options.warn },
    }),
    options.env,
  )
  // Every child process inherits this deployment, including the developer's
  // shell; the marker is what lets a source launch tell these values apart from
  // its own operator override and resolve its own tier.
  markInjectedSdkworkEnv(options.env)
  return { cwd }
}
