/**
 * Command line of the source `desktop:dev` launcher.
 *
 * `pnpm run` forwards a `--` separator verbatim when the script it runs is
 * itself a `pnpm run` call, so the form pnpm documents
 * (`pnpm desktop:dev -- --gateway domain`) reaches this launcher with the
 * separator in argv. It carries no meaning here — every token is an option —
 * and `node:util`'s strict parse would otherwise read the following flags as
 * positionals and fail. Dropping it keeps both the bare and the separated form
 * working from the repository root.
 * @module apps/desktop/scripts/development-arguments
 */

import { parseArgs } from 'node:util'

/** Resolved `desktop:dev` (`dev:desktop`) command line. */
export interface DevelopmentArguments {
  /** Launch the online debug lane against the deployed production tier instead of development. */
  readonly online: boolean
  /** Accept unverifiable TLS certificates; the online lane only. */
  readonly insecureTLS: boolean
  /** Reuse the artifacts of a previous build instead of rebuilding. */
  readonly skipBuild: boolean
  /** Gateway selector: `localhost`/`ip`, `domain`, a `host:port` pair, or an absolute http(s) origin. */
  readonly gateway: string
  /** Port override for the selected gateway, as written on the command line. */
  readonly gatewayPort: string | undefined
  /** Print the resolved gateway and exit before building or launching. */
  readonly printGateway: boolean
}

/**
 * Parse and validate one launcher command line.
 * @param argv - arguments after the script path, as `pnpm`/`node` delivered them.
 * @returns the resolved flags, with a leading or embedded `--` separator dropped.
 * @throws Error when a flag is unknown, or when `--online` is combined with a development gateway selection.
 */
export function parseDevelopmentArguments(argv: readonly string[]): DevelopmentArguments {
  const { values } = parseArgs({
    args: [...argv].filter(argument => argument !== '--'),
    options: {
      'skip-build': { type: 'boolean', default: false },
      online: { type: 'boolean', default: false },
      'insecure-tls': { type: 'boolean', default: false },
      gateway: { type: 'string', default: 'localhost' },
      'gateway-port': { type: 'string' },
      'print-gateway': { type: 'boolean', default: false },
    },
  })
  const online = values.online
  if (online && (values.gateway !== 'localhost' || values['gateway-port'] !== undefined)) {
    throw new Error('desktop development: --online targets the production gateway; '
      + '--gateway and --gateway-port select development gateways only')
  }
  if (values['insecure-tls'] && !online) {
    throw new Error('desktop development: --insecure-tls belongs to the --online debug lane')
  }
  return {
    online,
    insecureTLS: values['insecure-tls'],
    skipBuild: values['skip-build'],
    gateway: values.gateway,
    gatewayPort: values['gateway-port'],
    printGateway: values['print-gateway'],
  }
}
