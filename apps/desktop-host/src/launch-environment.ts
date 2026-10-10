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

import {
  applySdkworkLaunchEnv,
  ensureSdkworkBootstrapToken,
  markInjectedSdkworkEnv,
  materializeEnsuredBootstrapAccessToken,
  resolveSdkworkLaunchProfile,
} from '@deepseek-ai/dsh-sdkwork-env-bootstrap'

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
 * Apply the SDKWork launch environment and ensure the bootstrap token.
 *
 * The source-checkout test inside `applySdkworkLaunchEnv` is what selects the
 * lifecycle: a profile directory inside a checkout resolves development (the
 * tracked `.env.standalone.development` supplies the local gateway), while an
 * installed application's home directory resolves production.
 * @param options - invoking directory, mutable environment, and diagnostic sink.
 * @returns the project directory `loadLayeredEnv` must treat as its project layer.
 */
export async function applyDesktopLaunchEnvironment(
  options: ApplyDesktopLaunchEnvironmentOptions,
): Promise<DesktopLaunchEnvironment> {
  const { cwd } = applySdkworkLaunchEnv({
    cwd: options.cwd,
    profile: resolveSdkworkLaunchProfile(options.cwd),
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
