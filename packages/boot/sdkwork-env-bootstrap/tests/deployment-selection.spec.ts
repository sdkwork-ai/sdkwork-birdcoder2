import { describe, expect, it } from 'vitest'
import {
  SDKWORK_DEPLOYMENT_SELECTION_KEYS,
  normalizeSdkworkLifecycleEnvironment,
  withoutInheritedSdkworkDeployment,
} from '../src/index.ts'

describe('withoutInheritedSdkworkDeployment', () => {
  it('drops an inherited deployment but keeps the operator bootstrap credential', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/bin',
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
      SDKWORK_ACCESS_TOKEN: 'operator-token',
      SDKWORK_APP_ID: 'app_registered',
    }
    const pinned = withoutInheritedSdkworkDeployment(env)
    for (const name of SDKWORK_DEPLOYMENT_SELECTION_KEYS) expect(pinned).not.toHaveProperty(name)
    expect(pinned).toMatchObject({ PATH: '/bin', SDKWORK_ACCESS_TOKEN: 'operator-token', SDKWORK_APP_ID: 'app_registered' })
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.production')
  })
})

describe('normalizeSdkworkLifecycleEnvironment', () => {
  it('normalizes aliases and rejects unsupported names', () => {
    expect(normalizeSdkworkLifecycleEnvironment('dev')).toBe('development')
    expect(normalizeSdkworkLifecycleEnvironment('PROD')).toBe('production')
    expect(normalizeSdkworkLifecycleEnvironment('staging')).toBe('staging')
    expect(normalizeSdkworkLifecycleEnvironment('preview')).toBeUndefined()
    expect(normalizeSdkworkLifecycleEnvironment(undefined)).toBeUndefined()
  })
})
