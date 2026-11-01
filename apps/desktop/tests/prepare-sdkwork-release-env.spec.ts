import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSdkworkReleaseEnv } from '../../../packages/boot/sdkwork-env-bootstrap/src/index.ts'
import {
  SDKWORK_RELEASE_DISTRIBUTION_VARIABLE,
  SDKWORK_RELEASE_ENVIRONMENT_VARIABLE,
  SDKWORK_RELEASE_ENV_FILENAME,
  SDKWORK_RELEASE_ENV_OPT_IN,
  prepareSdkworkReleaseEnv,
  resolveDesktopDistributionClass,
  resolveSdkworkReleaseEnvironment,
} from '../scripts/prepare-sdkwork-release-env.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture(): { root: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), 'desktop-prepare-sdkwork-env-'))
  roots.push(root)
  return { root, out: join(root, 'sdkwork-release.env') }
}

describe('prepareSdkworkReleaseEnv', () => {
  it('treats an undeclared distribution as a deployment build and projects the credential', async () => {
    const { root, out } = fixture()
    const result = await prepareSdkworkReleaseEnv({
      env: { SDKWORK_ACCESS_TOKEN: 'local-production-token' },
      root,
      out,
      warn: () => {},
    })
    expect(result).toMatchObject({ enabled: true, distribution: 'deployment', environment: 'production' })
    const parsed = parseSdkworkReleaseEnv(readFileSync(out, 'utf8'))
    expect(parsed.ignored).toEqual([])
    expect(parsed.values).toMatchObject({
      SDKWORK_ENVIRONMENT: 'production',
      SDKWORK_PROFILE_ID: 'standalone.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
      SDKWORK_ACCESS_TOKEN: 'local-production-token',
    })
  })

  it('writes nothing for a public build and leaves a caller-chosen path alone', async () => {
    const { root, out } = fixture()
    writeFileSync(out, 'SDKWORK_ACCESS_TOKEN=stale\n')
    const result = await prepareSdkworkReleaseEnv({
      env: { [SDKWORK_RELEASE_DISTRIBUTION_VARIABLE]: 'public' },
      root,
      out,
      warn: () => {},
    })
    expect(result).toMatchObject({ enabled: false, distribution: 'public', keys: [] })
    // A caller-chosen path is not this tool's to delete.
    expect(existsSync(out)).toBe(true)
  })

  it('pins the lifecycle instead of inheriting another deployment', async () => {
    const { root, out } = fixture()
    const result = await prepareSdkworkReleaseEnv({
      env: {
        [SDKWORK_RELEASE_ENVIRONMENT_VARIABLE]: 'test',
        SDKWORK_ACCESS_TOKEN: 'local-test-token',
        // An inherited production deployment must not decide the artifact.
        SDKWORK_PROFILE_ID: 'standalone.production',
        SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
      },
      root,
      out,
      warn: () => {},
    })
    const parsed = parseSdkworkReleaseEnv(readFileSync(out, 'utf8'))
    expect(result.environment).toBe('test')
    expect(parsed.values.SDKWORK_PROFILE_ID).toBe('standalone.test')
    expect(parsed.values.SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL).toBe('https://api-test.birdcoder.com')
    expect(parsed.values.SDKWORK_ACCESS_TOKEN).toBe('local-test-token')
  })

  it('fails instead of writing an artifact the application cannot authenticate with', async () => {
    const { root, out } = fixture()
    await expect(prepareSdkworkReleaseEnv({ env: {}, root, out, warn: () => {} }))
      .rejects.toThrow('no reusable SDKWork bootstrap access token resolved for production')
    expect(existsSync(out)).toBe(false)
  })

  it('names the provisioning command and the public alternative in the failure', async () => {
    const { root, out } = fixture()
    await expect(prepareSdkworkReleaseEnv({ env: {}, root, out, warn: () => {} }))
      .rejects.toThrow('pnpm env:token:ensure --environment production')
    await expect(prepareSdkworkReleaseEnv({ env: {}, root, out, warn: () => {} }))
      .rejects.toThrow('DSH_DESKTOP_DISTRIBUTION=public')
  })

  it('maps the legacy opt-in onto the distribution class', async () => {
    const { root, out } = fixture()
    const disabled = await prepareSdkworkReleaseEnv({
      env: { [SDKWORK_RELEASE_ENV_OPT_IN]: '0' },
      root,
      out,
      warn: () => {},
    })
    expect(disabled).toMatchObject({ enabled: false, distribution: 'public' })
    await expect(prepareSdkworkReleaseEnv({
      env: { [SDKWORK_RELEASE_ENV_OPT_IN]: 'yes' },
      root,
      out,
      warn: () => {},
    })).rejects.toThrow('DSH_DESKTOP_SDKWORK_RELEASE_ENV must be 0 or 1')
    expect(existsSync(out)).toBe(false)
  })
})

describe('resolveDesktopDistributionClass', () => {
  it('defaults to deployment so an unset variable cannot ship an unauthenticated artifact', () => {
    expect(resolveDesktopDistributionClass({})).toBe('deployment')
    expect(resolveDesktopDistributionClass({ [SDKWORK_RELEASE_DISTRIBUTION_VARIABLE]: 'public' })).toBe('public')
    expect(resolveDesktopDistributionClass({ [SDKWORK_RELEASE_DISTRIBUTION_VARIABLE]: 'deployment' })).toBe('deployment')
  })

  it('prefers the distribution class over the legacy opt-in', () => {
    expect(resolveDesktopDistributionClass({
      [SDKWORK_RELEASE_DISTRIBUTION_VARIABLE]: 'public',
      [SDKWORK_RELEASE_ENV_OPT_IN]: '1',
    })).toBe('public')
  })

  it('rejects an unsupported class', () => {
    expect(() => resolveDesktopDistributionClass({ [SDKWORK_RELEASE_DISTRIBUTION_VARIABLE]: 'internal' }))
      .toThrow('DSH_DESKTOP_DISTRIBUTION must be deployment or public')
  })
})

describe('resolveSdkworkReleaseEnvironment', () => {
  it('defaults to production and rejects an unsupported tier', () => {
    expect(SDKWORK_RELEASE_ENV_FILENAME).toBe('sdkwork-release.env')
    expect(resolveSdkworkReleaseEnvironment({})).toBe('production')
    expect(resolveSdkworkReleaseEnvironment({ [SDKWORK_RELEASE_ENVIRONMENT_VARIABLE]: 'prod' })).toBe('production')
    expect(() => resolveSdkworkReleaseEnvironment({ [SDKWORK_RELEASE_ENVIRONMENT_VARIABLE]: 'preview' }))
      .toThrow('must be development, test, staging, or production')
  })
})
