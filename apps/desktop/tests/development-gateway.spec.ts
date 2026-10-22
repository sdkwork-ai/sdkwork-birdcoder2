import { describe, expect, it } from 'vitest'
import {
  applyDevelopmentGateway,
  DEFAULT_LOCAL_GATEWAY_PORT,
  DEVELOPMENT_GATEWAY_DOMAIN,
  resolveDevelopmentGateway,
} from '../scripts/development-gateway.ts'

describe('resolveDevelopmentGateway', () => {
  it('defaults to the standalone gateway loopback bind', () => {
    expect(resolveDevelopmentGateway(undefined, undefined)).toEqual({
      mode: 'ip',
      url: `http://127.0.0.1:${String(DEFAULT_LOCAL_GATEWAY_PORT)}`,
    })
  })

  it('accepts the ip selector and a replacement loopback port', () => {
    expect(resolveDevelopmentGateway('ip', 4000)).toEqual({
      mode: 'ip',
      url: 'http://127.0.0.1:4000',
    })
    expect(resolveDevelopmentGateway('localhost', 4000)).toEqual({
      mode: 'ip',
      url: 'http://127.0.0.1:4000',
    })
  })

  it('selects the development deployment domain', () => {
    expect(resolveDevelopmentGateway('domain', undefined)).toEqual({
      mode: 'domain',
      url: DEVELOPMENT_GATEWAY_DOMAIN,
    })
  })

  it('lets the domain mode carry the gateway port', () => {
    expect(resolveDevelopmentGateway('domain', 3900)).toEqual({
      mode: 'domain',
      url: 'http://api-dev.birdcoder.com:3900',
    })
  })

  it('accepts a bare host:port pair', () => {
    expect(resolveDevelopmentGateway('127.0.0.1:4000', undefined)).toEqual({
      mode: 'url',
      url: 'http://127.0.0.1:4000',
    })
    expect(resolveDevelopmentGateway('gateway.internal.test:8080', undefined)).toEqual({
      mode: 'url',
      url: 'http://gateway.internal.test:8080',
    })
  })

  it('accepts an explicit origin and normalizes it', () => {
    expect(resolveDevelopmentGateway('https://api-test.birdcoder.com/', undefined)).toEqual({
      mode: 'url',
      url: 'https://api-test.birdcoder.com',
    })
  })

  it('lets an explicit origin carry the port override', () => {
    expect(resolveDevelopmentGateway('https://api-test.birdcoder.com', 8443)).toEqual({
      mode: 'url',
      url: 'https://api-test.birdcoder.com:8443',
    })
  })

  it('rejects an invalid selector, port, scheme, path, or credentials', () => {
    expect(() => resolveDevelopmentGateway('gateway', undefined)).toThrow(/localhost.*ip.*domain|absolute http/)
    expect(() => resolveDevelopmentGateway('localhost', 0)).toThrow(/gateway-port/)
    expect(() => resolveDevelopmentGateway('localhost', 70_000)).toThrow(/gateway-port/)
    expect(() => resolveDevelopmentGateway('domain', 1.5)).toThrow(/gateway-port/)
    expect(() => resolveDevelopmentGateway('ftp://api.example.test', undefined)).toThrow(/http or https/)
    expect(() => resolveDevelopmentGateway('http://api.example.test/v3', undefined)).toThrow(/origin/)
    expect(() => resolveDevelopmentGateway('http://api.example.test/?x=1', undefined)).toThrow(/origin/)
    expect(() => resolveDevelopmentGateway('http://user:secret@api.example.test', undefined)).toThrow(/credentials/)
  })
})

describe('applyDevelopmentGateway', () => {
  it('projects one selection onto every SDKWork gateway key', () => {
    const environment = { PATH: '/bin', SDKWORK_ACCESS_TOKEN: 'token' }
    const applied = applyDevelopmentGateway(environment, { mode: 'ip', url: 'http://127.0.0.1:3900' })

    expect(applied).toEqual({
      PATH: '/bin',
      SDKWORK_ACCESS_TOKEN: 'token',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:3900',
      SDKWORK_BIRDCODER_APP_API_BASE_URL: 'http://127.0.0.1:3900',
      SDKWORK_IM_API_BASE_URL: 'http://127.0.0.1:3900',
    })
    // The caller's environment object stays untouched for the other consumers.
    expect(environment).toEqual({ PATH: '/bin', SDKWORK_ACCESS_TOKEN: 'token' })
  })
})
