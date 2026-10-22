/**
 * SDKWork gateway selection for the source `desktop:dev` lane.
 *
 * The desktop shell can reach the SDKWork API gateway either through its
 * deployment domain (the hosts-file mapping the deployment topology documents)
 * or through the gateway's loopback bind. The launcher defaults to loopback so a
 * developer who starts `sdkwork-api-cloud-gateway` needs no hosts entry; either
 * address is only a convenience for the developer — the client always uses the
 * address this launch selects, so a browser page and the desktop shell reach the
 * same gateway for the same environment.
 * @module apps/desktop/scripts/development-gateway
 */

/** Loopback port the standalone development gateway binds (`SDKWORK_API_CLOUD_GATEWAY_BIND`). */
export const DEFAULT_LOCAL_GATEWAY_PORT = 3900

/** Development deployment domain mapped to loopback by the development topology. */
export const DEVELOPMENT_GATEWAY_DOMAIN = 'http://api-dev.birdcoder.com'

/** Which gateway address the development launch targets. */
export type DevelopmentGatewayMode = 'ip' | 'domain' | 'url'

/** Resolved gateway address for one development launch. */
export interface DevelopmentGateway {
  /** How {@link url} was selected. */
  readonly mode: DevelopmentGatewayMode
  /** Gateway origin the Host and client use. */
  readonly url: string
}

/** Selectors that mean the gateway's loopback bind (ip + port). */
const LOOPBACK_SELECTORS = new Set(['', 'localhost', 'local', 'ip', 'loopback'])

/**
 * Validate one explicit port override.
 * @param port - candidate port, when the developer passed one.
 * @returns the validated port, or undefined when the launch passes none.
 * @throws {Error} when the port is not an integer from 1 through 65535.
 */
function resolvePort(port: number | undefined): number | undefined {
  if (port === undefined) return undefined
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('desktop development: --gateway-port must be an integer from 1 through 65535')
  }
  return port
}

/**
 * Whether the selector is written as something a URL can parse as an address.
 * @param value - selector text.
 * @returns whether the text names a host with a port or a dotted host.
 */
function looksLikeAddress(value: string): boolean {
  return value.includes(':') || value.includes('.')
}

/**
 * Normalize one explicit gateway origin.
 *
 * Accepts an absolute `http(s)` origin and the bare `host:port` form a
 * developer copies from a running gateway. Credentials, paths, queries, and
 * fragments are rejected: the value becomes a base URL for every SDK client.
 * @param value - selector text.
 * @param port - validated port override.
 * @returns the normalized origin.
 * @throws {Error} when the value cannot name a gateway origin.
 */
function resolveExplicitOrigin(value: string, port: number | undefined): string {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `http://${value}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error(
      'desktop development: --gateway must be "localhost", "ip", "domain", a host:port pair, '
      + 'or one absolute http(s) origin',
    )
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('desktop development: --gateway must use http or https')
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('desktop development: --gateway must not carry credentials')
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('desktop development: --gateway must be an origin without a path, query, or fragment')
  }
  if (port !== undefined) parsed.port = String(port)
  return parsed.origin
}

/**
 * Resolve the gateway selector a developer passed to `desktop:dev`.
 *
 * `localhost`/`ip` (the default) target the gateway's loopback bind and
 * `domain` targets the development deployment domain; `--gateway-port`
 * replaces the port of either. A host:port pair or an absolute http(s) origin
 * selects any other gateway directly.
 * @param selector - `ip`, `localhost`, `domain`, a host:port pair, or an absolute HTTP(S) origin.
 * @param port - port override for the selected gateway; defaults to the standalone bind.
 * @returns the gateway origin and the selector mode.
 * @throws {Error} when the selector or port cannot name a gateway origin.
 */
export function resolveDevelopmentGateway(
  selector: string | undefined,
  port: number | undefined,
): DevelopmentGateway {
  const raw = (selector ?? 'localhost').trim()
  const value = raw.toLowerCase()
  const requestedPort = resolvePort(port)
  if (LOOPBACK_SELECTORS.has(value)) {
    return { mode: 'ip', url: `http://127.0.0.1:${String(requestedPort ?? DEFAULT_LOCAL_GATEWAY_PORT)}` }
  }
  if (value === 'domain') {
    const url = requestedPort === undefined ? DEVELOPMENT_GATEWAY_DOMAIN : `${DEVELOPMENT_GATEWAY_DOMAIN}:${String(requestedPort)}`
    return { mode: 'domain', url }
  }
  if (!looksLikeAddress(raw)) {
    throw new Error(
      'desktop development: --gateway must be "localhost", "ip", "domain", a host:port pair, '
      + 'or one absolute http(s) origin',
    )
  }
  return { mode: 'url', url: resolveExplicitOrigin(raw, requestedPort) }
}

/**
 * Project the selected gateway onto every launch key the Host and client read.
 *
 * The environment projection derives `apiBaseUrl` from the platform gateway and
 * `imApiBaseUrl` from `SDKWORK_IM_API_BASE_URL`, so one selection drives IAM, the
 * API clients, and IM together instead of letting them drift across three
 * variables.
 * @param environment - launch environment to extend.
 * @param gateway - resolved gateway origin.
 * @returns a new environment with the gateway keys set.
 */
export function applyDevelopmentGateway(
  environment: NodeJS.ProcessEnv,
  gateway: DevelopmentGateway,
): NodeJS.ProcessEnv {
  return {
    ...environment,
    SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: gateway.url,
    SDKWORK_BIRDCODER_APP_API_BASE_URL: gateway.url,
    SDKWORK_IM_API_BASE_URL: gateway.url,
  }
}
