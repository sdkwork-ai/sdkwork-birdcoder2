import { describe, expect, it } from 'vitest'
import {
  KEEP_INHERITED_SDKWORK_ENV,
  declaresProductionSdkworkEnvironment,
  developmentLaunchEnvironment,
} from '../scripts/development-sdkwork-env.ts'

/** The environment a packaged Desktop application exports to its child processes. */
const LEAKED_PRODUCTION: NodeJS.ProcessEnv = {
  PATH: '/usr/bin',
  DSH_HOME: '/home/dev/.dsh',
  SDKWORK_ENVIRONMENT: 'production',
  SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_PROFILE_ID: 'standalone.production',
  SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
  SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
  SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.production',
  SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
}

describe('declaresProductionSdkworkEnvironment', () => {
  it('reads the tier from the application-scoped environment key', () => {
    expect(declaresProductionSdkworkEnvironment({ SDKWORK_BIRDCODER_ENVIRONMENT: 'production' })).toBe(true)
    expect(declaresProductionSdkworkEnvironment({ SDKWORK_BIRDCODER_ENVIRONMENT: 'staging' })).toBe(false)
  })

  it('prefers the environment segment of the profile id over the environment key', () => {
    expect(declaresProductionSdkworkEnvironment({
      SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_ENVIRONMENT: 'development',
    })).toBe(true)
    expect(declaresProductionSdkworkEnvironment({
      SDKWORK_PROFILE_ID: 'cloud.test',
      SDKWORK_ENVIRONMENT: 'production',
    })).toBe(false)
  })

  it('treats an inherited production gateway without identity keys as production', () => {
    expect(declaresProductionSdkworkEnvironment({
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
    })).toBe(true)
    expect(declaresProductionSdkworkEnvironment({
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    })).toBe(false)
  })

  it('reports no production tier for an empty environment', () => {
    expect(declaresProductionSdkworkEnvironment({})).toBe(false)
  })
})

describe('developmentLaunchEnvironment', () => {
  it('replaces an inherited production deployment with the development identity', () => {
    const { environment, dropped } = developmentLaunchEnvironment(LEAKED_PRODUCTION)
    expect(dropped).toEqual([
      'SDKWORK_ENVIRONMENT',
      'SDKWORK_DEPLOYMENT_PROFILE',
      'SDKWORK_PROFILE_ID',
      'SDKWORK_BIRDCODER_ENVIRONMENT',
      'SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE',
      'SDKWORK_BIRDCODER_PROFILE_ID',
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
    ])
    expect(environment.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBeUndefined()
    expect(environment.SDKWORK_ENVIRONMENT).toBe('development')
    expect(environment.SDKWORK_DEPLOYMENT_PROFILE).toBe('standalone')
    expect(environment.SDKWORK_PROFILE_ID).toBe('standalone.development')
    expect(environment.SDKWORK_BIRDCODER_ENVIRONMENT).toBe('development')
    expect(environment.SDKWORK_BIRDCODER_PROFILE_ID).toBe('standalone.development')
    expect(environment.PATH).toBe('/usr/bin')
    expect(environment.DSH_HOME).toBe('/home/dev/.dsh')
  })

  it('drops an inherited production access token', () => {
    const { environment } = developmentLaunchEnvironment({
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_ACCESS_TOKEN: 'production-token',
    })
    expect(environment.SDKWORK_ACCESS_TOKEN).toBeUndefined()
  })

  it('never mutates the inherited environment', () => {
    const inherited = { ...LEAKED_PRODUCTION }
    developmentLaunchEnvironment(inherited)
    expect(inherited.SDKWORK_ENVIRONMENT).toBe('production')
  })

  it('keeps an inherited test or staging tier', () => {
    const staging: NodeJS.ProcessEnv = {
      SDKWORK_BIRDCODER_ENVIRONMENT: 'staging',
      SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.staging',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api-staging.birdcoder.com',
    }
    const { environment, dropped } = developmentLaunchEnvironment(staging)
    expect(dropped).toEqual([])
    expect(environment).toBe(staging)
  })

  it('keeps the inherited environment when the developer opts out', () => {
    const optedOut: NodeJS.ProcessEnv = { ...LEAKED_PRODUCTION, [KEEP_INHERITED_SDKWORK_ENV]: '1' }
    const { environment, dropped } = developmentLaunchEnvironment(optedOut)
    expect(dropped).toEqual([])
    expect(environment).toBe(optedOut)
  })

  it('drops VITE_-projected SDKWork keys too', () => {
    const { dropped } = developmentLaunchEnvironment({
      SDKWORK_ENVIRONMENT: 'production',
      VITE_SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
    })
    expect(dropped).toContain('VITE_SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL')
  })

  it('leaves a developer-owned SDKWork environment alone when no tier is declared', () => {
    const bare: NodeJS.ProcessEnv = { SDKWORK_ACCESS_TOKEN: 'token' }
    expect(developmentLaunchEnvironment(bare)).toEqual({ environment: bare, dropped: [] })
  })
})
