import { describe, expect, it } from 'vitest'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { projectSdkworkEnvBase, resolveUiEnvEnvironment } from '../src/env-projection.ts'

function snapshot(values: Record<string, string | undefined>): ReturnType<typeof createLaunchEnvironmentSnapshot> {
  // The snapshot layer accepts only defined string values; an absent variable
  // stands for "not set", so undefined entries are dropped.
  const defined: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) defined[key] = value
  }
  return createLaunchEnvironmentSnapshot([{ source: 'process', values: defined }])
}

describe('resolveUiEnvEnvironment', () => {
  it('prefers the profile id environment segment', () => {
    expect(resolveUiEnvEnvironment(snapshot({
      SDKWORK_PROFILE_ID: 'standalone.test',
      SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
    }))).toBe('testing')
  })

  it('maps the application-scoped and generic keys', () => {
    expect(resolveUiEnvEnvironment(snapshot({ SDKWORK_BIRDCODER_ENVIRONMENT: 'development' }))).toBe('development')
    expect(resolveUiEnvEnvironment(snapshot({ SDKWORK_ENVIRONMENT: 'production' }))).toBe('production')
    expect(resolveUiEnvEnvironment(snapshot({ SDKWORK_BIRDCODER_ENVIRONMENT: 'test' }))).toBe('testing')
  })

  it('returns undefined without a supported environment', () => {
    expect(resolveUiEnvEnvironment(snapshot({}))).toBeUndefined()
    expect(resolveUiEnvEnvironment(snapshot({ SDKWORK_ENVIRONMENT: 'staging' }))).toBeUndefined()
    expect(resolveUiEnvEnvironment(snapshot({ SDKWORK_PROFILE_ID: 'cloud.staging' }))).toBeUndefined()
  })
})

describe('projectSdkworkEnvBase', () => {
  it('projects nothing without any SDKWork identity key', () => {
    expect(projectSdkworkEnvBase(snapshot({ DEEPSEEK_API_KEY: 'sk-x' }))).toEqual({})
  })

  it('projects the active slot and its env-declared fields', () => {
    expect(projectSdkworkEnvBase(snapshot({
      SDKWORK_PROFILE_ID: 'standalone.test',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api-test.birdcoder.com',
      SDKWORK_ACCESS_TOKEN: 'jwt.test',
    }))).toEqual({
      environment: 'testing',
      testing: {
        apiBaseUrl: 'https://api-test.birdcoder.com',
        accessToken: 'jwt.test',
      },
    })
  })

  it('resolves the base URL by priority: gateway, app-api, application ingress', () => {
    expect(projectSdkworkEnvBase(snapshot({
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
      SDKWORK_BIRDCODER_APP_API_BASE_URL: 'https://app.birdcoder.com',
      SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL: 'http://127.0.0.1:10240',
    })).development?.apiBaseUrl).toBe('https://api.birdcoder.com')
    expect(projectSdkworkEnvBase(snapshot({
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_APP_API_BASE_URL: 'https://app.birdcoder.com',
      SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL: 'http://127.0.0.1:10240',
    })).development?.apiBaseUrl).toBe('https://app.birdcoder.com')
    expect(projectSdkworkEnvBase(snapshot({
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_APPLICATION_PUBLIC_HTTP_URL: 'http://127.0.0.1:10240',
    })).development?.apiBaseUrl).toBe('http://127.0.0.1:10240')
  })

  it('omits empty access token and base URL fields', () => {
    expect(projectSdkworkEnvBase(snapshot({
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_ACCESS_TOKEN: '   ',
    }))).toEqual({ environment: 'production' })
  })

  it('keeps the user layer authoritative: absent env fields stay on defaults', () => {
    const base = projectSdkworkEnvBase(snapshot({ SDKWORK_PROFILE_ID: 'standalone.development' }))
    expect(base.development).toBeUndefined()
  })
})
