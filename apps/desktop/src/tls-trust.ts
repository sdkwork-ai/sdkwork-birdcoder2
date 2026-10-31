/** TLS trust for a gateway whose HTTPS certificate the shell cannot verify. */

/**
 * Environment variable that opts a launch — or, from the packaging environment,
 * a whole release — into accepting unverifiable certificates. `1` enables it and
 * `0` or an empty value leaves verification on.
 */
export const DESKTOP_INSECURE_TLS_VARIABLE = 'DSH_DESKTOP_INSECURE_TLS'

/** Electron switch that disables Chromium certificate validation for the shell, its renderers, and every embedded page. */
export const INSECURE_TLS_ELECTRON_SWITCH = '--ignore-certificate-errors'

/** Command-line argument that opts one packaged launch into accepting unverifiable certificates. */
export const INSECURE_TLS_ARGUMENT = '--insecure-tls'

/** Packaged-manifest field that makes every launch of one build accept unverifiable certificates. */
export const PACKAGED_INSECURE_TLS_FIELD = 'dshDesktopInsecureTls'

/** Which input selected the trust decision. */
export type DesktopTlsTrustSource = 'argument' | 'environment' | 'package'

/** Whether this launch accepts certificates it cannot verify. */
export interface DesktopTlsTrust {
  /** Whether HTTPS verification is disabled for this process and its children. */
  readonly insecure: boolean
  /** The input that enabled it; absent while verification stays on. */
  readonly source?: DesktopTlsTrustSource
}

/**
 * Compose the environment that makes Node-side processes accept unverifiable
 * certificates. Node reads the variable for every TLS connection, so the dsh
 * Host and the Node children it starts inherit the same decision.
 * @param environment - the environment to derive from; the input object is never changed.
 * @returns a new environment with verification disabled.
 */
export function insecureTlsEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...environment, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
}

/**
 * Resolve the trust decision for one launch. The command-line argument wins over
 * the environment variable, which wins over the packaged default, so an operator
 * can opt a single launch in even when the build never did.
 * @param options - the launch's argument presence, environment, and packaged manifest.
 * @returns the decision and, when enabled, the input that selected it.
 */
export function resolveDesktopTlsTrust(options: {
  readonly argument: boolean
  readonly environment: NodeJS.ProcessEnv
  readonly manifest?: unknown
}): DesktopTlsTrust {
  const configured = options.environment[DESKTOP_INSECURE_TLS_VARIABLE]?.trim()
  if (configured !== undefined && configured !== '' && configured !== '0' && configured !== '1') {
    throw new Error(`desktop tls: ${DESKTOP_INSECURE_TLS_VARIABLE} must be 0 or 1`)
  }
  if (options.argument) return { insecure: true, source: 'argument' }
  if (configured === '1') return { insecure: true, source: 'environment' }
  const manifest = options.manifest
  // Read before `ready`, where a throw would end the process without the fatal
  // report: only an explicit boolean `true` relaxes verification, so a corrupt
  // or hand-edited packed manifest keeps the secure default.
  if (typeof manifest === 'object' && manifest !== null
    && (manifest as Record<string, unknown>)[PACKAGED_INSECURE_TLS_FIELD] === true) {
    return { insecure: true, source: 'package' }
  }
  return { insecure: false }
}

/**
 * Apply one trust decision to the current process. Both network stacks have to
 * agree: renderers, embedded pages, and the updater's `net` requests use
 * Chromium, while the shell's Node fetches and the Host use Node TLS. Chromium
 * reads its command line before `ready`, so the caller applies this while the
 * module loads.
 * @param options - the decision, the Chromium command-line sink, the process environment, and the warning sink.
 */
export function applyDesktopTlsTrust(options: {
  readonly trust: DesktopTlsTrust
  readonly appendSwitch: (name: string) => void
  readonly environment: NodeJS.ProcessEnv
  readonly warn: (line: string) => void
}): void {
  if (!options.trust.insecure) return
  options.appendSwitch(INSECURE_TLS_ELECTRON_SWITCH)
  options.environment.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  options.warn(`desktop tls: accepting unverifiable HTTPS certificates (${options.trust.source ?? 'unknown'}); `
    + 'trust the gateway certificate where the traffic carries credentials')
}
