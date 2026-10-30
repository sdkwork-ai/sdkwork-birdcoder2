import { describe, expect, it } from 'vitest'
import {
  DESKTOP_SDKWORK_PROFILE_VARIABLE,
  INSECURE_TLS_ELECTRON_SWITCH,
  ONLINE_REQUEST_LOG_VARIABLE,
  PRODUCTION_GATEWAY_URL,
  PRODUCTION_PROFILE_ID,
  composeRequestLogNodeOptions,
  insecureTlsLaunchEnvironment,
  onlineBuildEnvironment,
  onlineLaunchEnvironment,
} from '../scripts/online-debug-launch.ts'

const LOGGER = joinPath('scripts', 'online-request-log.cjs')

function joinPath(...segments: string[]): string {
  return segments.join('/')
}

describe('onlineLaunchEnvironment', () => {
  it('forces the canonical production identity and gateway onto a blank environment', () => {
    const { environment, forced } = onlineLaunchEnvironment({ PATH: '/usr/bin' }, { requestLogModule: LOGGER })
    expect(environment.SDKWORK_ENVIRONMENT).toBe('production')
    expect(environment.SDKWORK_DEPLOYMENT_PROFILE).toBe('standalone')
    expect(environment.SDKWORK_PROFILE_ID).toBe(PRODUCTION_PROFILE_ID)
    expect(environment.SDKWORK_BIRDCODER_ENVIRONMENT).toBe('production')
    expect(environment.SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE).toBe('standalone')
    expect(environment.SDKWORK_BIRDCODER_PROFILE_ID).toBe(PRODUCTION_PROFILE_ID)
    expect(environment.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(PRODUCTION_GATEWAY_URL)
    expect(environment.SDKWORK_BIRDCODER_APP_API_BASE_URL).toBe(PRODUCTION_GATEWAY_URL)
    expect(environment.SDKWORK_IM_API_BASE_URL).toBe(PRODUCTION_GATEWAY_URL)
    expect(forced).toEqual([
      'SDKWORK_ENVIRONMENT',
      'SDKWORK_DEPLOYMENT_PROFILE',
      'SDKWORK_PROFILE_ID',
      'SDKWORK_BIRDCODER_ENVIRONMENT',
      'SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE',
      'SDKWORK_BIRDCODER_PROFILE_ID',
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
      'SDKWORK_BIRDCODER_APP_API_BASE_URL',
      'SDKWORK_IM_API_BASE_URL',
      DESKTOP_SDKWORK_PROFILE_VARIABLE,
      ONLINE_REQUEST_LOG_VARIABLE,
    ])
    expect(environment.PATH).toBe('/usr/bin')
    expect(environment[DESKTOP_SDKWORK_PROFILE_VARIABLE]).toBe('production')
  })

  it('forces the production profile and gateway over any inherited tier or origin', () => {
    const inherited: NodeJS.ProcessEnv = {
      SDKWORK_ENVIRONMENT: 'staging',
      SDKWORK_PROFILE_ID: 'cloud.staging',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api-staging.birdcoder.com',
      SDKWORK_IM_API_BASE_URL: 'https://im.example.com',
      SDKWORK_ACCESS_TOKEN: 'operator-token',
    }
    const { environment, forced } = onlineLaunchEnvironment(inherited, { requestLogModule: LOGGER })
    expect(environment.SDKWORK_PROFILE_ID).toBe(PRODUCTION_PROFILE_ID)
    expect(environment.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(PRODUCTION_GATEWAY_URL)
    expect(environment.SDKWORK_IM_API_BASE_URL).toBe(PRODUCTION_GATEWAY_URL)
    expect(forced).toContain('SDKWORK_PROFILE_ID')
    expect(forced).toContain('SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL')
    expect(forced).not.toContain('SDKWORK_ACCESS_TOKEN')
    expect(environment.SDKWORK_ACCESS_TOKEN).toBe('operator-token')
  })

  it('never changes SDKWork values outside the identity and gateway keys', () => {
    const inherited: NodeJS.ProcessEnv = {
      SDKWORK_ACCESS_TOKEN: 'token',
      SDKWORK_API_KEY: 'provider-key',
      SDKWORK_IM_EMBED_URL: 'https://embed.example.com/im-pc-embed.js',
      VITE_SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api-staging.birdcoder.com',
    }
    const { environment, forced } = onlineLaunchEnvironment(inherited, { requestLogModule: LOGGER })
    expect(environment.SDKWORK_ACCESS_TOKEN).toBe('token')
    expect(environment.SDKWORK_API_KEY).toBe('provider-key')
    expect(environment.SDKWORK_IM_EMBED_URL).toBe('https://embed.example.com/im-pc-embed.js')
    expect(environment.VITE_SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe('https://api-staging.birdcoder.com')
    expect(forced).toEqual([
      'SDKWORK_ENVIRONMENT',
      'SDKWORK_DEPLOYMENT_PROFILE',
      'SDKWORK_PROFILE_ID',
      'SDKWORK_BIRDCODER_ENVIRONMENT',
      'SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE',
      'SDKWORK_BIRDCODER_PROFILE_ID',
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
      'SDKWORK_BIRDCODER_APP_API_BASE_URL',
      'SDKWORK_IM_API_BASE_URL',
      DESKTOP_SDKWORK_PROFILE_VARIABLE,
      ONLINE_REQUEST_LOG_VARIABLE,
    ])
  })

  it('turns the request log on by default and keeps an explicit off value', () => {
    const defaulted = onlineLaunchEnvironment({}, { requestLogModule: LOGGER })
    expect(defaulted.environment[ONLINE_REQUEST_LOG_VARIABLE]).toBe('1')
    expect(defaulted.environment.NODE_OPTIONS).toContain('online-request-log.cjs')

    const off = onlineLaunchEnvironment({ [ONLINE_REQUEST_LOG_VARIABLE]: '0' }, { requestLogModule: LOGGER })
    expect(off.environment[ONLINE_REQUEST_LOG_VARIABLE]).toBe('0')
    expect(off.environment.NODE_OPTIONS).toBeUndefined()
  })

  it('never mutates the inherited environment', () => {
    const inherited: NodeJS.ProcessEnv = { SDKWORK_ENVIRONMENT: 'production' }
    onlineLaunchEnvironment(inherited, { requestLogModule: LOGGER })
    expect(inherited.SDKWORK_PROFILE_ID).toBeUndefined()
    expect(inherited.NODE_OPTIONS).toBeUndefined()
  })
})

describe('composeRequestLogNodeOptions', () => {
  it('prepends one quoted --require when NODE_OPTIONS is unset', () => {
    expect(composeRequestLogNodeOptions(undefined, LOGGER)).toBe(`--require "${LOGGER}"`)
    expect(composeRequestLogNodeOptions('  ', LOGGER)).toBe(`--require "${LOGGER}"`)
  })

  it('keeps existing directives behind the logger require', () => {
    expect(composeRequestLogNodeOptions('--max-old-space-size=8192', LOGGER))
      .toBe(`--require "${LOGGER}" --max-old-space-size=8192`)
  })

  it('never adds the logger twice', () => {
    expect(composeRequestLogNodeOptions(`--require "${LOGGER}"`, LOGGER)).toBe(`--require "${LOGGER}"`)
  })

  it('embeds a Windows path with forward slashes, which NODE_OPTIONS parsing keeps intact', () => {
    const directive = composeRequestLogNodeOptions(undefined, joinPath('D:', 'repo', 'apps', 'desktop', 'scripts', 'online-request-log.cjs'))
    expect(directive).toBe('--require "D:/repo/apps/desktop/scripts/online-request-log.cjs"')
    expect(directive).not.toContain('\\')
  })
})

describe('onlineBuildEnvironment', () => {
  it('restores the inherited NODE_OPTIONS so build stages never preload the request logger', () => {
    const launch = onlineLaunchEnvironment({ NODE_OPTIONS: '--max-old-space-size=8192' }, { requestLogModule: LOGGER })
    expect(launch.environment.NODE_OPTIONS).toContain('online-request-log.cjs')
    const build = onlineBuildEnvironment(launch.environment, { NODE_OPTIONS: '--max-old-space-size=8192' })
    expect(build.NODE_OPTIONS).toBe('--max-old-space-size=8192')
    expect(build.SDKWORK_PROFILE_ID).toBe('standalone.production')
  })

  it('omits NODE_OPTIONS when the launch inherited none', () => {
    const launch = onlineLaunchEnvironment({}, { requestLogModule: LOGGER })
    const build = onlineBuildEnvironment(launch.environment, {})
    expect(build.NODE_OPTIONS).toBeUndefined()
    expect(build[ONLINE_REQUEST_LOG_VARIABLE]).toBe('1')
  })
})

describe('insecureTlsLaunchEnvironment', () => {
  it('disables Node-side certificate verification without touching the input', () => {
    const environment = insecureTlsLaunchEnvironment({ SDKWORK_PROFILE_ID: 'standalone.production' })
    expect(environment.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0')
    expect(environment.SDKWORK_PROFILE_ID).toBe('standalone.production')
  })

  it('keeps the production composition the insecure flag layers onto', () => {
    const launch = onlineLaunchEnvironment({}, { requestLogModule: LOGGER })
    const insecure = insecureTlsLaunchEnvironment(launch.environment)
    expect(insecure.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(PRODUCTION_GATEWAY_URL)
    expect(insecure.NODE_OPTIONS).toContain('online-request-log.cjs')
  })

  it('exports the Chromium switch the launcher pushes onto the Electron command line', () => {
    expect(INSECURE_TLS_ELECTRON_SWITCH).toBe('--ignore-certificate-errors')
  })
})
