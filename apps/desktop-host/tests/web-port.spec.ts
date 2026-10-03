/** The Desktop Host Web port is a launch fact; the workspace launcher moves it off the packaged value. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DESKTOP_HOST_DEFAULT_WEB_PORT, DESKTOP_HOST_WEB_PORT_ENV, resolveDesktopHostWebPort } from '../src/web-port.ts'

const DEVELOPMENT_LAUNCHER = fileURLToPath(new URL('../../desktop/scripts/dev.ts', import.meta.url))

describe('Desktop Host Web port', () => {
  it('serves the packaged default when the environment names no port', () => {
    expect(resolveDesktopHostWebPort({})).toBe(DESKTOP_HOST_DEFAULT_WEB_PORT)
    expect(resolveDesktopHostWebPort({ [DESKTOP_HOST_WEB_PORT_ENV]: '' })).toBe(DESKTOP_HOST_DEFAULT_WEB_PORT)
  })

  it('takes the port the launch environment selects', () => {
    expect(resolveDesktopHostWebPort({ [DESKTOP_HOST_WEB_PORT_ENV]: '19388' })).toBe(19388)
    expect(resolveDesktopHostWebPort({ [DESKTOP_HOST_WEB_PORT_ENV]: '65535' })).toBe(65_535)
  })

  it.each(['0', '65536', '-1', '1.5', 'http'])('rejects %s instead of falling back to a default', (value) => {
    expect(() => resolveDesktopHostWebPort({ [DESKTOP_HOST_WEB_PORT_ENV]: value }))
      .toThrow(`${DESKTOP_HOST_WEB_PORT_ENV} must be an integer from 1 through 65535`)
  })

  it('keeps the workspace launcher on another port through this same variable', () => {
    // A rename on either side would put development back on the packaged port and let the
    // launcher's own availability probe pass while the Host still fails to bind.
    const launcher = readFileSync(DEVELOPMENT_LAUNCHER, 'utf8')
    expect(launcher).toContain(DESKTOP_HOST_WEB_PORT_ENV)
    const developmentPort = /const DEVELOPMENT_HOST_WEB_PORT = (\d+)/u.exec(launcher)?.[1]
    expect(developmentPort).toBeDefined()
    expect(Number(developmentPort)).not.toBe(DESKTOP_HOST_DEFAULT_WEB_PORT)
  })
})
