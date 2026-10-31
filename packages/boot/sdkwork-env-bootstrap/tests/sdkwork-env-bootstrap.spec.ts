import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bootstrapMock = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }))

vi.mock('@sdkwork/iam-application-bootstrap', () => ({
  bootstrapApplicationFromManifest: async (input: Record<string, unknown>) => {
    bootstrapMock.calls.push(input)
    return {
      env: {
        SDKWORK_ACCESS_TOKEN: 'provisioned-production-jwt',
        SDKWORK_TENANT_ID: '100001',
        SDKWORK_ORGANIZATION_ID: '0',
        SDKWORK_APP_ID: 'app_provisioned',
      },
    }
  },
  createFetchIamApplicationBootstrapClient: () => ({}),
  createIamApplicationBootstrapClientFromAppbaseBackendSdk: () => ({}),
  formatBootstrapEnvFile: () => 'SDKWORK_ACCESS_TOKEN=provisioned-production-jwt\n',
  hashManifestContent: () => 'manifest-hash',
  writeRegisteredBootstrapEnvFiles: async () => ['/overlay/.env.standalone.production.bootstrap.local'],
  loadBootstrapAuthProfileFromHome: async () => null,
  resolveBootstrapAuth: (options: { env?: Record<string, string | undefined> }) => {
    const username = options.env?.SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME?.trim()
    const password = options.env?.SDKWORK_IAM_BOOTSTRAP_OPERATOR_PASSWORD?.trim()
    return username !== undefined && password !== undefined ? { username, password } : {}
  },
  resolveBootstrapEnvironmentFromEnv: () => ({ primaryDomain: 'api.birdcoder.com' }),
}))

import {
  applySdkworkLaunchEnv,
  bootstrapLocalEnvPath,
  clearInheritedInjectedSdkworkEnv,
  dropUnmarkedPackagedProductionDeployment,
  ensureSdkworkBootstrapToken,
  isLoopbackGatewayHostname,
  parseHostsLoopbackNames,
  markInjectedSdkworkEnv,
  materializeEnsuredBootstrapAccessToken,
  resolveSdkworkBootstrapProfile,
  resolveSdkworkLaunchProfile,
  resolveSdkworkRepoRoot,
  SDKWORK_DEVELOPMENT_GATEWAY_URL,
  SDKWORK_INJECTED_ENV_MARKER,
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

/**
 * A gateway host that is never local. The tier domains cannot serve this role:
 * a developer publishes the local platform gateway under `api-dev.birdcoder.com`
 * by mapping it to `127.0.0.1` in the system hosts file, which is exactly what
 * `isLoopbackGatewayHostname` recognizes, so a tier domain asserts the machine's
 * own configuration rather than the module's behavior.
 */
const REMOTE_GATEWAY_URL = 'https://gateway.invalid'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sdkwork-env-bootstrap-'))
  writeFileSync(join(dir, 'agent.app.config.json'), MANIFEST)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('resolveSdkworkRepoRoot', () => {
  it('walks up to the directory that owns agent.app.config.json', () => {
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

  it('ignores a deployment another application injected into this process tree', () => {
    const env: Record<string, string | undefined> = {
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_PRODUCTION_GATEWAY_URL,
    }
    markInjectedSdkworkEnv(env)
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.development')
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_DEVELOPMENT_GATEWAY_URL)
    expect(env[SDKWORK_INJECTED_ENV_MARKER]).toBeUndefined()
  })

  it('keeps an operator override that differs from the injected value', () => {
    const env: Record<string, string | undefined> = {
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_PRODUCTION_GATEWAY_URL,
    }
    markInjectedSdkworkEnv(env)
    env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL = 'http://127.0.0.1:10240'
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe('http://127.0.0.1:10240')
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

  it('copies the development fixture overlay token for a remote development gateway', () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), [
      '# SDKWork private bootstrap credentials (gitignored).',
      'SDKWORK_ACCESS_TOKEN=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
      '',
    ].join('\n'))
    writeFileSync(trackedSdkworkEnvPath(dir, 'development'), [
      `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=${REMOTE_GATEWAY_URL}`,
      '',
    ].join('\n'))
    const env: Record<string, string | undefined> = {}
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(REMOTE_GATEWAY_URL)
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature')
  })

  it('does not copy a fixture overlay token outside the development tier', () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'test'), [
      'SDKWORK_ACCESS_TOKEN=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
      '',
    ].join('\n'))
    writeFileSync(trackedSdkworkEnvPath(dir, 'test'), [
      `SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL=${REMOTE_GATEWAY_URL}`,
      '',
    ].join('\n'))
    const env: Record<string, string | undefined> = { SDKWORK_PROFILE_ID: 'standalone.test' }
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
  })

  it('prefers the environment-scoped overlay over the unscoped registration output', () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), [
      'SDKWORK_ACCESS_TOKEN=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
      '',
    ].join('\n'))
    writeFileSync(join(dir, '.sdkwork.local.env'), 'SDKWORK_ACCESS_TOKEN=registered-dev-token\n')
    const env: Record<string, string | undefined> = {}
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_ACCESS_TOKEN).toBe(
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
    )
  })

  it('fills a blank token from the unscoped registration output when no overlay exists', () => {
    writeFileSync(join(dir, '.sdkwork.local.env'), 'SDKWORK_ACCESS_TOKEN=registered-dev-token\n')
    const env: Record<string, string | undefined> = {}
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('registered-dev-token')
  })

  /** The complete production deployment a packaged parent leaks into its children. */
  function packagedProductionDeployment(): Record<string, string | undefined> {
    return {
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
      SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
      SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_PRODUCTION_GATEWAY_URL,
    }
  }

  it('drops an unmarked packaged production deployment inherited from the parent process', () => {
    const env = packagedProductionDeployment()
    const lines: string[] = []
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn: line => lines.push(line) })
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.development')
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_DEVELOPMENT_GATEWAY_URL)
    expect(lines.join('')).toContain("ignoring the packaged application's production deployment")
  })

  it('keeps the whole inherited deployment once any of its keys differs from the production default', () => {
    const env: Record<string, string | undefined> = { ...packagedProductionDeployment(), SDKWORK_ENVIRONMENT: 'staging' }
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_PRODUCTION_GATEWAY_URL)
    expect(env.SDKWORK_PROFILE_ID).toBe('standalone.production')
  })

  it('keeps a production gateway the operator exported without a production profile id', () => {
    const env: Record<string, string | undefined> = {
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_PRODUCTION_GATEWAY_URL,
    }
    applySdkworkLaunchEnv({ cwd: dir, profile: 'development', env, warn })
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe(SDKWORK_PRODUCTION_GATEWAY_URL)
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

describe('gateway loopback resolution', () => {
  it('accepts loopback literals without consulting the hosts file', () => {
    expect(isLoopbackGatewayHostname('localhost')).toBe(true)
    expect(isLoopbackGatewayHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackGatewayHostname('127.9.9.9')).toBe(true)
    expect(isLoopbackGatewayHostname('[::1]')).toBe(true)
    expect(isLoopbackGatewayHostname('LOCALHOST')).toBe(true)
    expect(isLoopbackGatewayHostname('128.0.0.1')).toBe(false)
    expect(isLoopbackGatewayHostname('1270.0.0.1')).toBe(false)
  })

  it('publishes the local platform gateway under a tier domain through the hosts file', () => {
    const hosts = [
      '# Tier domains are the local platform gateway on a developer machine.',
      '127.0.0.1\tapi-dev.birdcoder.com   api.birdcoder.com',
      '127.0.0.1   localhost',
      '::1         ipv6-localhost',
      '10.0.0.7    remote.example.com   # a real remote host changes nothing',
      '',
    ].join('\n')
    expect(isLoopbackGatewayHostname('api-dev.birdcoder.com', hosts)).toBe(true)
    expect(isLoopbackGatewayHostname('API-DEV.BIRDCODER.COM', hosts)).toBe(true)
    expect(isLoopbackGatewayHostname('api.birdcoder.com', hosts)).toBe(true)
    expect(isLoopbackGatewayHostname('localhost', hosts)).toBe(true)
    expect(isLoopbackGatewayHostname('remote.example.com', hosts)).toBe(false)
    expect(isLoopbackGatewayHostname('unmapped.example.com', hosts)).toBe(false)
  })

  it('reads the loopback names a hosts file declares and ignores every other mapping', () => {
    const names = parseHostsLoopbackNames([
      '127.0.0.1 api-dev.birdcoder.com api.birdcoder.com',
      '10.0.0.7 remote.example.com',
      '::1 ipv6-localhost',
      'not-an-address  ignored.example.com',
      '# 127.0.0.1 commented.example.com',
      '',
    ].join('\n'))
    expect([...names].sort()).toEqual([
      'api-dev.birdcoder.com',
      'api.birdcoder.com',
      'ipv6-localhost',
    ])
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

  it('accepts a configured development fixture token on the remote development gateway', async () => {
    const fixture = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature'
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: REMOTE_GATEWAY_URL,
      SDKWORK_ACCESS_TOKEN: fixture,
    }
    expect(await ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
    })).toEqual({ status: 'configured' })
    expect(env.SDKWORK_ACCESS_TOKEN).toBe(fixture)
  })

  it('rejects a fixture token outside the development tier on a remote gateway', async () => {
    const fixture = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature'
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.test',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: REMOTE_GATEWAY_URL,
      SDKWORK_ACCESS_TOKEN: fixture,
    }
    expect(await ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
      allowTestTokenGeneration: true,
    })).toEqual({
      status: 'unavailable',
      reason: 'fixture bootstrap tokens outside the development tier require a loopback SDKWork gateway',
    })
    expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
  })

  it('reuses a production gateway-issued JWT on the production profile regardless of issuer', async () => {
    // The embedded production IAM signs its own bootstrap credentials with
    // `iss: sdkwork-iam-local` (sdkwork-iam-web-adapter access_token_issue.rs),
    // so the issuer alone cannot distinguish a local gateway's token from a
    // production one. Reuse is claims-based per IAM_APPLICATION_BOOTSTRAP_SPEC
    // section 5.4.2; a token minted by the wrong gateway fails at request time
    // and is regenerated then.
    const sign = (payload: Record<string, unknown>): string =>
      [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify(payload)).toString('base64url'),
        Buffer.from('signature-bytes').toString('base64url'),
      ].join('.')
    const issued = sign({
      app_id: 'app_01a18b4f-6f61-7ff1-b86c-75b54995883f',
      aud: 'app_01a18b4f-6f61-7ff1-b86c-75b54995883f',
      environment: 'prod',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'sdkwork-iam-local',
      token_type: 'access',
    })
    const env: Record<string, string | undefined> = {
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
      SDKWORK_ACCESS_TOKEN: issued,
    }
    expect(await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })).toEqual({
      status: 'configured',
    })
    expect(env.SDKWORK_ACCESS_TOKEN).toBe(issued)
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

  it('rejects a registered fixture token outside the development tier on a remote gateway', async () => {
    const fixture = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature'
    writeFileSync(join(dir, '.sdkwork.local.env'), `SDKWORK_ACCESS_TOKEN=${fixture}\n`)
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.test',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: REMOTE_GATEWAY_URL,
    }
    expect(await ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
      allowTestTokenGeneration: true,
    })).toEqual({
      status: 'unavailable',
      reason: 'fixture bootstrap tokens outside the development tier require a loopback SDKWork gateway',
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

  it('reuses a cached token without calling IAM bootstrap or the network', async () => {
    const token = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({
        app_id: 'sdkwork-birdcoder',
        environment: 'development',
        exp: Math.floor(Date.now() / 1000) + 3600,
        token_version: 1,
      })).toString('base64url'),
      'signature',
    ].join('.')
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), `SDKWORK_ACCESS_TOKEN=${token}\n`)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      const env = {
        SDKWORK_PROFILE_ID: 'standalone.development',
        SDKWORK_ACCESS_TOKEN: token,
        SDKWORK_BACKEND_BASE_URL: 'http://127.0.0.1:3900',
        SDKWORK_IAM_BOOTSTRAP_OPERATOR_PASSWORD: 'operator-password',
        SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME: 'admin',
        SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: REMOTE_GATEWAY_URL,
      }
      const result = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })
      expect(result.status).toBe('configured')
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
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

  it('generates a development fixture token for the remote development gateway', async () => {
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: REMOTE_GATEWAY_URL,
    }
    const result = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn, tryApplicationBootstrap: false })
    expect(result.status).toBe('generated')
    expect(existsSync(bootstrapLocalEnvPath(dir, 'development'))).toBe(true)
  })

  it('reuses an existing local fixture overlay for the remote development gateway', async () => {
    writeFileSync(bootstrapLocalEnvPath(dir, 'development'), [
      '# SDKWork private bootstrap credentials (gitignored).',
      'SDKWORK_ACCESS_TOKEN=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
      '',
    ].join('\n'))
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: REMOTE_GATEWAY_URL,
    }
    await expect(ensureSdkworkBootstrapToken({
      cwd: dir,
      env,
      warn,
      tryApplicationBootstrap: false,
    })).resolves.toEqual({
      status: 'generated',
      path: bootstrapLocalEnvPath(dir, 'development'),
      token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJhcHBfaWQiOiJzZGt3b3JrLWJpcmRjb2RlciJ9.signature',
    })
  })

  it('fails closed for production and staging', async () => {
    const env = { SDKWORK_PROFILE_ID: 'standalone.production' }
    const result = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })
    expect(result.status).toBe('unavailable')
    expect(result.status === 'unavailable' ? result.reason : '').toContain('private secret source')
    expect(existsSync(bootstrapLocalEnvPath(dir, 'production'))).toBe(false)
  })

  it('provisions a production token when operator credentials exist', async () => {
    bootstrapMock.calls.length = 0
    const env: Record<string, string | undefined> = {
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
      SDKWORK_IAM_BOOTSTRAP_OPERATOR_USERNAME: 'platform-owner',
      SDKWORK_IAM_BOOTSTRAP_OPERATOR_PASSWORD: 'operator-password',
    }
    // IAM_APPLICATION_BOOTSTRAP_SPEC section 5.4.3: the application bootstrap
    // path runs before the fail-closed rule, which binds fixture generation
    // only — a production launch with operator credentials self-provisions.
    await expect(ensureSdkworkBootstrapToken({ cwd: dir, env, warn })).resolves.toEqual({
      status: 'registered',
      token: 'provisioned-production-jwt',
    })
    expect(bootstrapMock.calls).toHaveLength(1)
    expect(env.SDKWORK_ACCESS_TOKEN).toBeUndefined()
  })

  it('reports unavailable when the manifest is missing', async () => {
    rmSync(join(dir, 'agent.app.config.json'))
    const env = {
      SDKWORK_PROFILE_ID: 'standalone.development',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'http://127.0.0.1:10240',
    }
    const result = await ensureSdkworkBootstrapToken({ cwd: dir, env, warn })
    expect(result.status).toBe('unavailable')
    expect(result.status === 'unavailable' ? result.reason : '').toContain('agent.app.config.json')
  })
})

describe('injected environment provenance', () => {
  it('marks every non-empty SDKWork value this process resolved', () => {
    const env: Record<string, string | undefined> = {
      PATH: '/usr/bin',
      SDKWORK_ENVIRONMENT: 'production',
      VITE_SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
      SDKWORK_ACCESS_TOKEN: '',
    }
    markInjectedSdkworkEnv(env)
    expect(env[SDKWORK_INJECTED_ENV_MARKER]?.split('\n')).toEqual([
      'SDKWORK_ENVIRONMENT=production',
      'VITE_SDKWORK_BIRDCODER_ENVIRONMENT=production',
    ])
  })

  it('marks nothing when the environment carries no SDKWork value', () => {
    const env: Record<string, string | undefined> = { PATH: '/usr/bin' }
    markInjectedSdkworkEnv(env)
    expect(env[SDKWORK_INJECTED_ENV_MARKER]).toBeUndefined()
  })

  it('drops only the values that still match the marker and consumes it', () => {
    const env: Record<string, string | undefined> = {
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
      SDKWORK_ACCESS_TOKEN: 'production-token',
    }
    markInjectedSdkworkEnv(env)
    env.SDKWORK_ACCESS_TOKEN = 'operator-token'
    expect(clearInheritedInjectedSdkworkEnv(env)).toEqual([
      'SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL',
      'SDKWORK_ENVIRONMENT',
    ])
    expect(env.SDKWORK_ENVIRONMENT).toBeUndefined()
    expect(env.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBeUndefined()
    expect(env.SDKWORK_ACCESS_TOKEN).toBe('operator-token')
    expect(env[SDKWORK_INJECTED_ENV_MARKER]).toBeUndefined()
  })

  it('ignores an absent marker and a malformed entry', () => {
    expect(clearInheritedInjectedSdkworkEnv({ SDKWORK_ENVIRONMENT: 'production' })).toEqual([])
    const env: Record<string, string | undefined> = {
      [SDKWORK_INJECTED_ENV_MARKER]: 'no-separator\n=empty-key',
      SDKWORK_ENVIRONMENT: 'production',
    }
    expect(clearInheritedInjectedSdkworkEnv(env)).toEqual([])
    expect(env.SDKWORK_ENVIRONMENT).toBe('production')
  })

  it('recognizes only a complete, default-valued production deployment', () => {
    const complete: Record<string, string | undefined> = {
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_DEPLOYMENT_PROFILE: 'standalone',
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
      SDKWORK_BIRDCODER_DEPLOYMENT_PROFILE: 'standalone',
      SDKWORK_BIRDCODER_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_PRODUCTION_GATEWAY_URL,
    }
    expect(dropUnmarkedPackagedProductionDeployment({ ...complete }).sort()).toEqual(Object.keys(complete).sort())
    // A profile id without the production gateway is an operator choosing the
    // tier, not a packaged deployment: nothing is dropped.
    expect(dropUnmarkedPackagedProductionDeployment({ SDKWORK_PROFILE_ID: 'standalone.production' })).toEqual([])
    expect(dropUnmarkedPackagedProductionDeployment({
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: SDKWORK_PRODUCTION_GATEWAY_URL,
    })).toEqual([])
    // One changed key keeps the whole set, and unrelated SDKWork values survive.
    const customized = { ...complete, SDKWORK_ENVIRONMENT: 'staging', SDKWORK_BACKEND_BASE_URL: 'https://internal.example' }
    expect(dropUnmarkedPackagedProductionDeployment(customized)).toEqual([])
    expect(customized.SDKWORK_ENVIRONMENT).toBe('staging')
    expect(customized.SDKWORK_BACKEND_BASE_URL).toBe('https://internal.example')
  })
})
