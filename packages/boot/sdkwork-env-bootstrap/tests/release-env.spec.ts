import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SDKWORK_DEPLOYMENT_SELECTION_KEYS,
  SDKWORK_RELEASE_ENV_KEYS,
  applySdkworkReleaseEnv,
  normalizeSdkworkLifecycleEnvironment,
  parseSdkworkReleaseEnv,
  readSdkworkReleaseEnvFile,
  renderSdkworkReleaseEnv,
  selectSdkworkReleaseEnv,
  withoutInheritedSdkworkDeployment,
} from '../src/index.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(content: string): string {
  const root = mkdtempSync(join(tmpdir(), 'sdkwork-release-env-'))
  roots.push(root)
  const path = join(root, 'sdkwork-release.env')
  writeFileSync(path, content)
  return path
}

describe('release environment allowlist', () => {
  it('selects only allowlisted non-empty values and trims them', () => {
    const selected = selectSdkworkReleaseEnv({
      SDKWORK_PROFILE_ID: ' standalone.production ',
      SDKWORK_ACCESS_TOKEN: 'token',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://gateway.example',
      SDKWORK_ENVIRONMENT: '   ',
      SDKWORK_DATABASE_URL: 'postgres://secret',
      SDKWORK_IAM_BOOTSTRAP_OPERATOR_PASSWORD: 'secret',
      DEEPSEEK_API_KEY: 'secret',
      VITE_SDKWORK_ACCESS_TOKEN: 'secret',
    })
    expect(selected).toEqual({
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://gateway.example',
      SDKWORK_ACCESS_TOKEN: 'token',
    })
    for (const name of Object.keys(selected)) expect(SDKWORK_RELEASE_ENV_KEYS).toContain(name)
  })
})

describe('renderSdkworkReleaseEnv', () => {
  it('writes the allowlist order under a private-artifact header', () => {
    const content = renderSdkworkReleaseEnv({
      SDKWORK_ACCESS_TOKEN: 'token',
      SDKWORK_PROFILE_ID: 'standalone.production',
    })
    expect(content).toContain('private deployment artifact')
    expect(content.trimEnd().split('\n').slice(-2)).toEqual([
      'SDKWORK_PROFILE_ID=standalone.production',
      'SDKWORK_ACCESS_TOKEN=token',
    ])
  })

  it('rejects a value that would declare a second key', () => {
    expect(() => renderSdkworkReleaseEnv({ SDKWORK_ACCESS_TOKEN: 'token\nSDKWORK_APP_ID=other' }))
      .toThrow('SDKWORK_ACCESS_TOKEN must be a single line')
  })
})

describe('parseSdkworkReleaseEnv', () => {
  it('keeps allowlisted values and reports the names it rejected', () => {
    const parsed = parseSdkworkReleaseEnv([
      '\uFEFF# comment',
      'SDKWORK_PROFILE_ID=standalone.production',
      'SDKWORK_ACCESS_TOKEN=',
      'SDKWORK_ACCESS_TOKEN="token"',
      'VITE_SDKWORK_APP_ID=public',
      'DEEPSEEK_API_KEY=secret',
      '',
    ].join('\n'))
    expect(parsed.values).toEqual({ SDKWORK_PROFILE_ID: 'standalone.production', SDKWORK_ACCESS_TOKEN: 'token' })
    expect(parsed.ignored).toEqual(['DEEPSEEK_API_KEY', 'VITE_SDKWORK_APP_ID'])
  })
})

describe('applySdkworkReleaseEnv', () => {
  it('fills only names the launch environment leaves blank', () => {
    const env: Record<string, string | undefined> = {
      SDKWORK_ACCESS_TOKEN: 'operator-token',
      SDKWORK_PROFILE_ID: '  ',
    }
    const applied = applySdkworkReleaseEnv({
      SDKWORK_ACCESS_TOKEN: 'packaged-token',
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_ACCESS_TOKEN_IGNORED: 'not allowlisted',
    }, env)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('operator-token')
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.production')
    expect(applied).toEqual(['SDKWORK_PROFILE_ID'])
  })
})

describe('readSdkworkReleaseEnvFile', () => {
  it('returns undefined when the installed application carries no artifact', () => {
    expect(readSdkworkReleaseEnvFile(join(tmpdir(), 'missing-sdkwork-release.env'))).toBeUndefined()
  })

  it('reads a written artifact', () => {
    const path = fixture(renderSdkworkReleaseEnv({ SDKWORK_ACCESS_TOKEN: 'token' }))
    expect(readSdkworkReleaseEnvFile(path)?.values).toEqual({ SDKWORK_ACCESS_TOKEN: 'token' })
  })
})

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
