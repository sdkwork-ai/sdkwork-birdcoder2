import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applySdkworkLaunchEnv,
  bootstrapLocalEnvPath,
  ensureSdkworkBootstrapToken,
  materializeEnsuredBootstrapAccessToken,
  resolveSdkworkBootstrapProfile,
  resolveSdkworkLaunchProfile,
  resolveSdkworkRepoRoot,
  SDKWORK_DEVELOPMENT_GATEWAY_URL,
  SDKWORK_STAGING_GATEWAY_URL,
  SDKWORK_TEST_GATEWAY_URL,
  SDKWORK_PRODUCTION_GATEWAY_URL,
  trackedSdkworkEnvPath,
} from '../src/index.ts'

const MANIFEST = JSON.stringify({
  schemaVersion: 3,
  app: { key: 'sdkwork-birdcoder', name: 'SDKWork Birdcoder', appType: 'APP_REACT' },
  backend: {
    appId: 'sdkwork-birdcoder',
    tenantId: '100001',
    organizationId: '0',
    accessTokenPermissionScope: ['iam.users.read'],
  },
})

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sdkwork-env-bootstrap-'))
  writeFileSync(join(dir, 'sdkwork.app.config.json'), MANIFEST)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('resolveSdkworkRepoRoot', () => {
  it('walks up to the directory that owns sdkwork.app.config.json', () => {
    const nested = join(dir, 'apps', 'desktop')
    mkdirSync(nested, { recursive: true })
    expect(resolveSdkworkRepoRoot(nested)).toBe(resolve(dir))
  })

  it('returns the start directory when no manifest exists', () => {
    const isolated = mkdtempSync(join(tmpdir(), 'sdkwork-env-nomarker-'))
    try {
      expect(resolveSdkworkRepoRoot(isolated)).toBe(resolve(isolated))
    } finally {
      rmSync(isolated, { recursive: true, force: true })
    }
  })
})

describe('resolveSdkworkLaunchProfile', () => {
  it('selects development inside a source checkout and production otherwise', () => {
    const nested = join(dir, 'apps', 'cli')
    mkdirSync(nested, { recursive: true })
    expect(resolveSdkworkLaunchProfile(nested)).toBe('development')
    expect(resolveSdkworkLaunchProfile(dir)).toBe('development')
    const isolated = mkdtempSync(join(tmpdir(), 'sdkwork-env-nolaunch-'))
    try {
      expect(resolveSdkworkLaunchProfile(isolated)).toBe('production')
    } finally {
      rmSync(isolated, { recursive: true, force: true })
    }
  })
})

describe('applySdkworkLaunchEnv', () => {
  const warn = (): void => {}

  it('applies the development gateway from the tracked env file when launched from a subdirectory', () => {
    writeFileSync(join(dir, '.env.standalone.development'), [
      'SDKWORK_ENVIRONMENT=development',
      'SDKWORK_PROFILE_ID=standalone.development',
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=http://api-dev.birdcoder.com',
      'SDKWORK_ACCESS_TOKEN=',
      'DEEPSEEK_API_KEY=',
      '',
    ].join('\n'))
    const nested = join(dir, 'apps', 'desktop')
    mkdirSync(nested, { recursive: true })
    const env: Record<string, string | undefined> = {}
    expect(applySdkworkLaunchEnv({ cwd: nested, profile: 'development', env, warn }).cwd).toBe(resolve(dir))
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_DEVELOPMENT_GATEWAY_URL)
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.development')
    expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
    expect(env.DEEPSEEK_API_KEY).toBeUndefined()
  })

  it('falls back to the development gateway when the tracked file is absent', () => {
    const env: Record<string, string | undefined> = {}
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_DEVELOPMENT_GATEWAY_URL)
    expect(env.SDKWORK_ENVIRONMENT).toBe('development')
  })

  it('prefers the repo-root .env lifecycle over the development launch default', () => {
    writeFileSync(join(dir, '.env'), [
      'SDKWORK_PROFILE_ID=standalone.test',
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=https://api-test.birdcoder.com',
      '',
    ].join('\n'))
    writeFileSync(trackedSdkworkEnvPath(dir, 'test'), [
      'SDKWORK_ENVIRONMENT=test',
      'SDKWORK_PROFILE_ID=standalone.test',
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=https://api-test.birdcoder.com',
      '',
    ].join('\n'))
    const nested = join(dir, 'apps', 'desktop')
    mkdirSync(nested, { recursive: true })
    const env: Record<string, string | undefined> = {}
    expect(applySdkworkLaunchEnv({ cwd: nested, profile: 'development', env, warn }).cwd).toBe(resolve(dir))
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.test')
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_TEST_GATEWAY_URL)
  })

  it('applies the production gateway for a packaged build without walking to a repo root', () => {
    const nested = join(dir, 'apps', 'desktop')
    mkdirSync(nested, { recursive: true })
    const env: Record<string, string | undefined> = {}
    const cwd = applySdkworkLaunchEnv({ cwd: nested, profile: 'production', env, warn }).cwd
    expect(cwd).toBe(resolve(nested))
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_PRODUCTION_GATEWAY_URL)
    expect(env.SDKWORK_ENVIRONMENT).toBe('production')
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.production')
  })

  it('does not replace an inherited process-env gateway URL', () => {
    const env: Record<string, string | undefined> = {
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api-custom.example',
    }
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe('https://api-custom.example')
  })

  it('copies an overlay token into a blank launch environment', () => {
    writeFileSync(join(dir, '.env.standalone.development'), [
      'SDKWORK_PROFILE_ID=standalone.development',
      'SDKWORK_ACCESS_TOKEN=',
      '',
    ].join('\n'))
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), 'SDKWORK_ACCESS_TOKEN=overlay-jwt\n')
    const env: Record<string, string | undefined> = {
      SDKWORK_ACCESS_TOKEN: '',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    }
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('overlay-jwt')
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.development')
  })

  it('does not copy a fixture overlay token when the gateway is remote', () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), [
      '# SDKWork private bootstrap credentials (gitignored).',
      'SDKWORK_ACCESS_TOKEN=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
      '',
    ].join('\n'))
    const env: Record<string, string | undefined> = {}
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_DEVELOPMENT_GATEWAY_URL)
    expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
  })

  it('prefers a registered .sdkwork.local.env token over a fixture overlay', () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), [
      'SDKWORK_ACCESS_TOKEN=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
      '',
    ].join('\n'))
    writeFileSync(join(dir, '.sdkwork.local.env'), 'SDKWORK_ACCESS_TOKEN=registered-dev-token\n')
    const env: Record<string, string | undefined> = {}
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('registered-dev-token')
  })

  it('uses the selected lifecycle overlay instead of always reading development', () => {
    writeFileSync(join(dir, '.env'), [
      'SDKWORK_PROFILE_ID=standalone.staging',
      'SDKWORK_ACCESS_TOKEN=',
      '',
    ].join('\n'))
    writeFileSync(trackedSdkworkEnvPath(dir, 'staging'), [
      'SDKWORK_ENVIRONMENT=staging',
      'SDKWORK_PROFILE_ID=standalone.staging',
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=https://api-staging.birdcoder.com',
      '',
    ].join('\n'))
    writeFileSync(bootstrapLocalEnvPath(dir, 'staging'), 'SDKWORK_ACCESS_TOKEN=staging-jwt\n')
    const env: Record<string, string | undefined> = {}
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.staging')
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_STAGING_GATEWAY_URL)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('staging-jwt')
  })
})

describe('resolveSdkworkBootstrapProfile', () => {
  it('prefers the exact profile id over the pair', () => {
    expect(resolveSdkworkBootstrapProfile({
      SDKWORK_PROFILE_ID: 'standalone.test',
      SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
    })).toEqual({ environment: 'test', deploymentProfile: 'standalone', profileId: 'standalone.test' })
  })

  it('falls back to the application-scoped environment keys', () => {
    expect(resolveSdkworkBootstrapProfile({
      SDKWORK_BIRDCODER_ENVIRONMENT: 'development',
    })).toEqual({ environment: 'development', deploymentProfile: 'standalone', profileId: 'standalone.development' })
    expect(resolveSdkworkBootstrapProfile({
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_DEPLOYMENT_PROFILE: 'cloud',
    })).toEqual({ environment: 'production', deploymentProfile: 'cloud', profileId: 'cloud.production' })
  })

  it('normalizes dev/prod aliases', () => {
    expect(resolveSdkworkBootstrapProfile({ SDKWORK_PROFILE_ID: 'standalone.dev' })?.environment).toBe('development')
    expect(resolveSdkworkBootstrapProfile({ SDKWORK_BIRDCODER_ENVIRONMENT: 'prod' })?.environment).toBe('production')
  })

  it('accepts single-segment SDKWORK_PROFILE_ID aliases as standalone profiles', () => {
    expect(resolveSdkworkBootstrapProfile({ SDKWORK_PROFILE_ID: 'test' })).toEqual({
      environment: 'test',
      deploymentProfile: 'standalone',
      profileId: 'standalone.test',
    })
    expect(resolveSdkworkBootstrapProfile({ SDKWORK_PROFILE_ID: 'staging' })).toEqual({
      environment: 'staging',
      deploymentProfile: 'standalone',
      profileId: 'standalone.staging',
    })
  })

  it('returns undefined without any SDKWork identity key or for unknown values', () => {
    expect(resolveSdkworkBootstrapProfile({})).toBeUndefined()
    expect(resolveSdkworkBootstrapProfile({ SDKWORK_PROFILE_ID: 'local.private' })).toBeUndefined()
    expect(resolveSdkworkBootstrapProfile({ SDKWORK_ENVIRONMENT: 'sandbox' })).toBeUndefined()
  })
})

describe('bootstrapLocalEnvPath', () => {
  it('names the profile overlay per section 5.1.7', () => {
    expect(basename(bootstrapLocalEnvPath('/repo', 'test'))).toBe('.env.standalone.test.bootstrap.local')
  })
})

describe('materializeEnsuredBootstrapAccessToken', () => {
  it('copies generated and registered tokens into the launch environment', () => {
    const env: Record<string, string | undefined> = {}
    materializeEnsuredBootstrapAccessToken({ status: 'generated', path: '/tmp/overlay', token: 'generated' }, env)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('generated')
    materializeEnsuredBootstrapAccessToken({ status: 'registered', token: 'registered' }, env)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('registered')
  })

  it('leaves configured, unconfigured, and unavailable outcomes unchanged', () => {
    const env: Record<string, string | undefined> = { SDKWORK_ACCESS_TOKEN: 'existing' }
    materializeEnsuredBootstrapAccessToken({ status: 'configured' }, env)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('existing')
    materializeEnsuredBootstrapAccessToken({ status: 'unconfigured' }, env)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('existing')
    materializeEnsuredBootstrapAccessToken({ status: 'unavailable', reason: 'missing package' }, env)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('existing')
  })
})

describe('ensureSdkworkBootstrapToken', () => {
  const warn = (): void => {}

  it('reports unconfigured without any SDKWork identity key', async () => {
    expect(await ensureSdkworkBootstrapToken({ cwd: dir, env: {}, warn })).toEqual({ status: 'unconfigured' })
  })

  it('keeps an explicitly configured token', async () => {
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_ACCESS_TOKEN: 'already-there',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    }
    expect(await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })).toEqual({ status: 'configured' })
  })

  it('rejects a configured fixture token on a remote gateway', async () => {
    const fixture = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature'
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://api-dev.birdcoder.com',
      SDKWORK_ACCESS_TOKEN: fixture,
    }
    expect(await ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
    })).toEqual({
      status: 'unavailable',
      reason: 'development/test fixture tokens require a loopback SDKWork gateway',
    })
    expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
  })

  it('treats an empty SDKWORK_ACCESS_TOKEN as unset and reuses the overlay', async () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), 'SDKWORK_ACCESS_TOKEN=overlay-jwt\n')
    const env = { SDKWORK_PROFILE_ID: 'standalone.development', SDKWORK_ACCESS_TOKEN: '' }
    expect(await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })).toEqual({
      status: 'generated',
      path: bootstrapLocalEnvPath(dir, 'development'),
      token: 'overlay-jwt',
    })
  })

  it('reuses the registration output token', async () => {
    writeFileSync(join(dir, '.sdkwork.local.env'), 'SDKWORK_ACCESS_TOKEN=registered-token\n')
    const env = { SDKWORK_PROFILE_ID: 'standalone.development' }
    expect(await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })).toEqual({
      status: 'registered',
      token: 'registered-token',
    })
  })

  it('rejects a registered fixture token on a remote gateway', async () => {
    const fixture = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature'
    writeFileSync(join(dir, '.sdkwork.local.env'), `SDKWORK_ACCESS_TOKEN=${fixture}\n`)
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://api-dev.birdcoder.com',
    }
    expect(await ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
    })).toEqual({
      status: 'unavailable',
      reason: 'development/test fixture tokens require a loopback SDKWork gateway',
    })
  })

  it('generates a development fixture JWT into the gitignored overlay and is idempotent', async () => {
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    }
    const first = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })
    expect(first.status).toBe('generated')
    expect(first.status === 'generated' ? first.path : '').toBe(bootstrapLocalEnvPath(dir, 'development'))
    const overlay = bootstrapLocalEnvPath(dir, 'development')
    expect(existsSync(overlay)).toBe(true)
    const content = readFileSync(overlay, 'utf8')
    expect(content).toMatch(/^# SDKWork private bootstrap credentials \(gitignored\)\.\nSDKWORK_ACCESS_TOKEN=.+\n$/u)
    const before = readFileSync(overlay, 'utf8')
    const second = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })
    expect(second.status).toBe('generated')
    expect(readFileSync(overlay, 'utf8')).toBe(before)
  })

  it('generates for test only with the explicit allowance', async () => {
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.test',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    }
    expect(await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })).toEqual({
      status: 'unavailable',
      reason: 'test token generation requires allowTestTokenGeneration',
    })
    expect(existsSync(bootstrapLocalEnvPath(dir, 'test'))).toBe(false)
    const allowed = await ensureSdkworkBootstrapToken({ cwd: dir, env, allowTestTokenGeneration: true, warn })
    expect(allowed.status).toBe('generated')
  })

  it('fails closed for a remote development gateway instead of generating a local fixture token', async () => {
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://api-dev.birdcoder.com',
    }
    await expect(ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
    })).resolves.toEqual({
      status: 'unavailable',
      reason: 'development/test fixture tokens require a loopback SDKWork gateway',
    })
    expect(existsSync(bootstrapLocalEnvPath(dir, 'development'))).toBe(false)
  })

  it('ignores an existing local fixture overlay when the active gateway is remote', async () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), [
      '# SDKWork private bootstrap credentials (gitignored).',
      'SDKWORK_ACCESS_TOKEN=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
      '',
    ].join('\n'))
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://api-dev.birdcoder.com',
    }
    await expect(ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
    })).resolves.toEqual({
      status: 'unavailable',
      reason: 'development/test fixture tokens require a loopback SDKWork gateway',
    })
  })

  it('fails closed for production and staging', async () => {
    const env = { SDKWORK_PROFILE_ID: 'standalone.production' }
    const result = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })
    expect(result.status).toBe('unavailable')
    expect(result.status === 'unavailable' ? result.reason : '').toContain('private secret source')
    expect(existsSync(bootstrapLocalEnvPath(dir, 'production'))).toBe(false)
  })

  it('reports unavailable when the manifest is missing', async () => {
    rmSync(join(dir, 'sdkwork.app.config.json'))
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    }
    const result = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })
    expect(result.status).toBe('unavailable')
    expect(result.status === 'unavailable' ? result.reason : '').toContain('sdkwork.app.config.json')
  })
})
