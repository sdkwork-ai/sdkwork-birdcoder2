import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_INSECURE_TLS_VARIABLE,
  INSECURE_TLS_ARGUMENT,
  INSECURE_TLS_ELECTRON_SWITCH,
  PACKAGED_INSECURE_TLS_FIELD,
  applyDesktopTlsTrust,
  insecureTlsEnvironment,
  resolveDesktopTlsTrust,
} from '../src/tls-trust.ts'

describe('resolveDesktopTlsTrust', () => {
  it('keeps verification on when no input opts in', () => {
    expect(resolveDesktopTlsTrust({ argument: false, environment: {} })).toEqual({ insecure: false })
    expect(resolveDesktopTlsTrust({ argument: false, environment: { [DESKTOP_INSECURE_TLS_VARIABLE]: '' } }))
      .toEqual({ insecure: false })
    expect(resolveDesktopTlsTrust({ argument: false, environment: { [DESKTOP_INSECURE_TLS_VARIABLE]: '0' } }))
      .toEqual({ insecure: false })
    expect(resolveDesktopTlsTrust({
      argument: false, environment: {}, manifest: { [PACKAGED_INSECURE_TLS_FIELD]: false },
    })).toEqual({ insecure: false })
  })

  it('accepts the packaged default only when the manifest field is true', () => {
    expect(resolveDesktopTlsTrust({
      argument: false, environment: {}, manifest: { [PACKAGED_INSECURE_TLS_FIELD]: true },
    })).toEqual({ insecure: true, source: 'package' })
  })

  it('accepts the environment variable and reports it as the source', () => {
    expect(resolveDesktopTlsTrust({
      argument: false, environment: { [DESKTOP_INSECURE_TLS_VARIABLE]: '1' },
    })).toEqual({ insecure: true, source: 'environment' })
    expect(resolveDesktopTlsTrust({
      argument: false, environment: { [DESKTOP_INSECURE_TLS_VARIABLE]: ' 1 ' },
    })).toEqual({ insecure: true, source: 'environment' })
  })

  it('lets the launch argument win over the environment and the packaged default', () => {
    expect(resolveDesktopTlsTrust({
      argument: true,
      environment: { [DESKTOP_INSECURE_TLS_VARIABLE]: '0' },
      manifest: { [PACKAGED_INSECURE_TLS_FIELD]: false },
    })).toEqual({ insecure: true, source: 'argument' })
  })

  it('rejects a malformed environment value instead of guessing', () => {
    for (const value of ['true', 'yes', '2', 'on']) {
      expect(() => resolveDesktopTlsTrust({ argument: false, environment: { [DESKTOP_INSECURE_TLS_VARIABLE]: value } }))
        .toThrow(`${DESKTOP_INSECURE_TLS_VARIABLE} must be 0 or 1`)
    }
  })

  it('keeps verification on for a packaged value that is not the boolean true', () => {
    for (const value of ['true', 1, null, {}]) {
      expect(resolveDesktopTlsTrust({
        argument: false, environment: {}, manifest: { [PACKAGED_INSECURE_TLS_FIELD]: value },
      })).toEqual({ insecure: false })
    }
  })

  it('treats a manifest that is not an object as carrying no default', () => {
    expect(resolveDesktopTlsTrust({ argument: false, environment: {}, manifest: undefined })).toEqual({ insecure: false })
    expect(resolveDesktopTlsTrust({ argument: false, environment: {}, manifest: null })).toEqual({ insecure: false })
    expect(resolveDesktopTlsTrust({ argument: false, environment: {}, manifest: 'manifest' })).toEqual({ insecure: false })
  })
})

describe('insecureTlsEnvironment', () => {
  it('disables Node-side verification without changing the input', () => {
    const inherited: NodeJS.ProcessEnv = { NODE_TLS_REJECT_UNAUTHORIZED: '1', SDKWORK_PROFILE_ID: 'standalone.production' }
    const environment = insecureTlsEnvironment(inherited)
    expect(environment).toEqual({ NODE_TLS_REJECT_UNAUTHORIZED: '0', SDKWORK_PROFILE_ID: 'standalone.production' })
    expect(inherited.NODE_TLS_REJECT_UNAUTHORIZED).toBe('1')
  })
})

describe('applyDesktopTlsTrust', () => {
  it('adds the Chromium switch, exports the Node variable, and warns once', () => {
    const appendSwitch = vi.fn()
    const environment: NodeJS.ProcessEnv = {}
    const warn = vi.fn()
    applyDesktopTlsTrust({ trust: { insecure: true, source: 'environment' }, appendSwitch, environment, warn })
    expect(appendSwitch).toHaveBeenCalledExactlyOnceWith(INSECURE_TLS_ELECTRON_SWITCH)
    expect(environment.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0')
    expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('accepting unverifiable HTTPS certificates (environment)'))
  })

  it('changes nothing while verification stays on', () => {
    const appendSwitch = vi.fn()
    const environment: NodeJS.ProcessEnv = {}
    const warn = vi.fn()
    applyDesktopTlsTrust({ trust: { insecure: false }, appendSwitch, environment, warn })
    expect(appendSwitch).not.toHaveBeenCalled()
    expect(environment).toEqual({})
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('launch inputs', () => {
  it('spells the packaged launch argument and Chromium switch the shell reads', () => {
    expect(INSECURE_TLS_ARGUMENT).toBe('--insecure-tls')
    expect(INSECURE_TLS_ELECTRON_SWITCH).toBe('--ignore-certificate-errors')
  })
})
