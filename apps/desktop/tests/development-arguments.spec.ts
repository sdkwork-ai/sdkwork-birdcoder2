import { describe, expect, it } from 'vitest'
import { parseDevelopmentArguments } from '../scripts/development-arguments.ts'

describe('parseDevelopmentArguments', () => {
  it('defaults to the standalone loopback gateway and the development lane', () => {
    expect(parseDevelopmentArguments([])).toEqual({
      online: false,
      insecureTLS: false,
      skipBuild: false,
      gateway: 'localhost',
      gatewayPort: undefined,
      printGateway: false,
    })
  })

  it('selects the development deployment domain, with or without a port override', () => {
    expect(parseDevelopmentArguments(['--gateway', 'domain'])).toMatchObject({
      gateway: 'domain',
      gatewayPort: undefined,
      online: false,
    })
    expect(parseDevelopmentArguments(['--gateway', 'domain', '--gateway-port', '3900'])).toMatchObject({
      gateway: 'domain',
      gatewayPort: '3900',
    })
  })

  it('accepts the deployment domain as an explicit origin', () => {
    expect(parseDevelopmentArguments(['--gateway', 'api-dev.birdcoder.com'])).toMatchObject({
      gateway: 'api-dev.birdcoder.com',
    })
  })

  // `pnpm run` keeps the separator when the script it invokes is another
  // `pnpm run`, so the documented passthrough form must still parse.
  it('drops the argument separator pnpm forwards verbatim', () => {
    expect(parseDevelopmentArguments(['--', '--print-gateway', '--gateway', 'domain'])).toMatchObject({
      printGateway: true,
      gateway: 'domain',
    })
    expect(parseDevelopmentArguments(['--gateway', 'domain', '--', '--print-gateway'])).toMatchObject({
      printGateway: true,
      gateway: 'domain',
    })
  })

  it('keeps the online lane selectable with its own flags', () => {
    expect(parseDevelopmentArguments(['--online', '--insecure-tls', '--skip-build'])).toMatchObject({
      online: true,
      insecureTLS: true,
      skipBuild: true,
      gateway: 'localhost',
    })
  })

  it('rejects a development gateway selection on the production lane', () => {
    expect(() => parseDevelopmentArguments(['--online', '--gateway', 'domain'])).toThrow(/production gateway/)
    expect(() => parseDevelopmentArguments(['--online', '--gateway-port', '3900'])).toThrow(/production gateway/)
    expect(() => parseDevelopmentArguments(['--online', '--gateway', 'localhost'])).not.toThrow()
  })

  it('rejects the TLS debug switch outside the online lane', () => {
    expect(() => parseDevelopmentArguments(['--insecure-tls'])).toThrow(/--online debug lane/)
  })

  it('rejects an unknown or positional argument', () => {
    expect(() => parseDevelopmentArguments(['--gateway-mode', 'domain'])).toThrow()
    expect(() => parseDevelopmentArguments(['domain'])).toThrow()
  })
})
