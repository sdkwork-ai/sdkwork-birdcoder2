/** Loopback port the Desktop Host serves the Web application on. */

/** Environment variable that moves the Host off the packaged default port. */
export const DESKTOP_HOST_WEB_PORT_ENV = 'DSH_DESKTOP_HOST_WEB_PORT'

/** Port the packaged shell serves; the workspace launcher selects its own so both can run at once. */
export const DESKTOP_HOST_DEFAULT_WEB_PORT = 19387

/**
 * Resolve the Web port handed to the shared profile runner.
 * @param environment - Host process environment; an absent or empty `DSH_DESKTOP_HOST_WEB_PORT` keeps the packaged default.
 * @returns Loopback TCP port for the Web application.
 * @throws Error when the configured value is not an integer from 1 through 65535.
 */
export function resolveDesktopHostWebPort(environment: NodeJS.ProcessEnv): number {
  const configured = environment[DESKTOP_HOST_WEB_PORT_ENV]
  if (configured === undefined || configured === '') return DESKTOP_HOST_DEFAULT_WEB_PORT
  const port = Number(configured)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`desktop host: ${DESKTOP_HOST_WEB_PORT_ENV} must be an integer from 1 through 65535`)
  }
  return port
}
