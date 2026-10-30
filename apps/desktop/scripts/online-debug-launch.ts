/**
 * SDKWork launch environment for the source `desktop:prod` lane.
 *
 * The mirror image of {@link ./development-sdkwork-env.ts}: that module drops an
 * inherited production deployment and declares the development tier, while this
 * one guarantees the production tier for a local debugging run against the
 * deployed online environment. The identity and gateway keys are forced to the
 * canonical `standalone.production` values (SDKWORK-SPECS ENVIRONMENT_SPEC
 * section 5.1: the profile id is `<deploymentProfile>.<environment>`, and
 * production uses the bare role host `https://api.birdcoder.com`), so the
 * launched application and the client build always talk to `api.birdcoder.com`
 * under the production profile no matter what the inheriting shell carries.
 * Every other SDKWork value — the access token, provider keys, IM embed URL —
 * is inherited untouched.
 *
 * The same composed environment turns on the outbound-HTTP request log: the
 * Electron child inherits a `NODE_OPTIONS` `--require` of
 * {@link ./online-request-log.cjs}, which prints one line per outbound request
 * from the shell, the Host, and every Node child they spawn. The log is
 * controlled by {@link ONLINE_REQUEST_LOG_VARIABLE} so a launch can keep the
 * production tier without the request lines.
 * @module apps/desktop/scripts/online-debug-launch
 */

/** Environment variable that turns the preloaded request log on. */
export const ONLINE_REQUEST_LOG_VARIABLE = 'DSH_ONLINE_REQUEST_LOG'

/** Electron switch that disables Chromium certificate validation (renderer and the main process's network stack). */
export const INSECURE_TLS_ELECTRON_SWITCH = '--ignore-certificate-errors'

/**
 * Compose the launch environment for `--insecure-tls`: the Node-side processes
 * (the dsh Host and every Node child) accept self-signed certificates when
 * `NODE_TLS_REJECT_UNAUTHORIZED=0`, which this repository's probes verified for
 * global fetch, undici, and `node:https`. The Electron switch covers the
 * Chromium side and is pushed onto the command line by the launcher.
 * @param environment - the composed launch environment.
 * @returns a new environment with TLS verification disabled.
 */
export function insecureTlsLaunchEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...environment, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
}

/**
 * Environment variable through which the Desktop Host honors an explicit tier
 * declaration instead of its source-checkout test (owner:
 * `apps/desktop-host/src/launch-environment.ts`). Without it the Host would
 * re-resolve this lane's checkout-enclosed profile directory back onto the
 * development tier and discard the production selection below.
 */
export const DESKTOP_SDKWORK_PROFILE_VARIABLE = 'DSH_DESKTOP_SDKWORK_PROFILE'

/** Basename of the preloaded request logger; `NODE_OPTIONS` entries are deduplicated on it. */
export const ONLINE_REQUEST_LOG_MODULE_BASENAME = 'online-request-log.cjs'

/** Gateway origin the production tier uses (`https://api.birdcoder.com`). */
export const PRODUCTION_GATEWAY_URL = 'https://api.birdcoder.com'

/** Profile id of the canonical production materialization (`.env.standalone.production`). */
export const PRODUCTION_PROFILE_ID = 'standalone.production'

/** Gateway keys one launch selection projects, mirroring the development lane's three-key projection. */
const PRODUCTION_GATEWAY_KEYS = [
  'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
  'SDKWORK_BIRDCODER_APP_API_BASE_URL',
  'SDKWORK_IM_API_BASE_URL',
] as const

/**
 * Canonical production identity (SDKWORK-SPECS ENVIRONMENT_SPEC section 5.1.2,
 * the same key set the tracked `.env.standalone.production` materializes),
 * forced onto every launch so the profile and its gateway are guaranteed.
 */
const PRODUCTION_IDENTITY: Record<string, string> = {
  SDKWORK_ENVIRONMENT: 'production',
  SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_PROFILE_ID: PRODUCTION_PROFILE_ID,
  SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
  SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_BIRDCODER_PROFILE_ID: PRODUCTION_PROFILE_ID,
}

/** Result of {@link onlineLaunchEnvironment}. */
export interface OnlineLaunchEnvironment {
  /** Environment for the Electron child; the same object when nothing changed. */
  readonly environment: NodeJS.ProcessEnv
  /** Keys forced to their canonical production value, in application order. */
  readonly forced: readonly string[]
}

/** Arguments of {@link onlineLaunchEnvironment}. */
export interface OnlineLaunchOptions {
  /** Absolute path of the request logger module required through `NODE_OPTIONS`. */
  readonly requestLogModule: string
}

/** Whether a value is unset or whitespace-only. */
function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === ''
}

/**
 * Prepend one `--require` of the request logger to a `NODE_OPTIONS` value,
 * keeping any directives the developer already set and never adding the logger
 * twice. The path is embedded with forward slashes: Node's `NODE_OPTIONS`
 * parser strips backslashes inside quotes as escape sequences (`D:\repo`
 * arrives as `D:repo`), and a `file:` URL is rejected by `--require`.
 * @param existing - inherited `NODE_OPTIONS`, when set.
 * @param requestLogModule - absolute logger module path.
 * @returns the composed `NODE_OPTIONS` value.
 */
export function composeRequestLogNodeOptions(existing: string | undefined, requestLogModule: string): string {
  const directive = `--require "${requestLogModule.replaceAll('\\', '/')}"`
  if (existing === undefined || existing.trim() === '') return directive
  if (existing.includes(ONLINE_REQUEST_LOG_MODULE_BASENAME)) return existing
  return `${directive} ${existing}`
}

/**
 * The environment the build stages run under. They inherit the production
 * identity (the client build resolves its SDKWork profile from it) but not the
 * preloaded request logger: only the launched application tree should log, so
 * the inherited `NODE_OPTIONS` value is restored (an undefined value omits the
 * key from the child environment).
 * @param launchEnvironment - the composed online launch environment.
 * @param inherited - the original launching process environment.
 * @returns the build-stage environment.
 */
export function onlineBuildEnvironment(
  launchEnvironment: NodeJS.ProcessEnv,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return { ...launchEnvironment, NODE_OPTIONS: inherited.NODE_OPTIONS }
}

/**
 * Guarantee the production tier for a source `desktop:prod` launch. The
 * identity and gateway keys are forced to the canonical `standalone.production`
 * values; inherited SDKWork values of every other name (access token, provider
 * keys) pass through. The request log defaults on and its preloaded module
 * joins `NODE_OPTIONS` unless {@link ONLINE_REQUEST_LOG_VARIABLE} is `0`.
 * @param env - the launching process environment.
 * @param options - the logger module to preload.
 * @returns the environment to pass to the Electron child plus the forced keys.
 */
export function onlineLaunchEnvironment(
  env: NodeJS.ProcessEnv,
  options: OnlineLaunchOptions,
): OnlineLaunchEnvironment {
  const next: NodeJS.ProcessEnv = { ...env }
  const forced: string[] = []
  for (const [key, value] of Object.entries(PRODUCTION_IDENTITY)) {
    if (next[key] !== value) forced.push(key)
    next[key] = value
  }
  for (const key of PRODUCTION_GATEWAY_KEYS) {
    if (next[key] !== PRODUCTION_GATEWAY_URL) forced.push(key)
    next[key] = PRODUCTION_GATEWAY_URL
  }
  if (next[DESKTOP_SDKWORK_PROFILE_VARIABLE] !== 'production') forced.push(DESKTOP_SDKWORK_PROFILE_VARIABLE)
  next[DESKTOP_SDKWORK_PROFILE_VARIABLE] = 'production'
  if (blank(next[ONLINE_REQUEST_LOG_VARIABLE])) {
    next[ONLINE_REQUEST_LOG_VARIABLE] = '1'
    forced.push(ONLINE_REQUEST_LOG_VARIABLE)
  }
  if (next[ONLINE_REQUEST_LOG_VARIABLE] === '1') {
    next.NODE_OPTIONS = composeRequestLogNodeOptions(next.NODE_OPTIONS, options.requestLogModule)
  }
  return { environment: next, forced }
}
