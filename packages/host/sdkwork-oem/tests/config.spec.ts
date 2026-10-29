/**
 * OEM profile validation: shipped defaults, derived endpoint bases, the
 * credential-origin pairing rule, and fail-loud file reads.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_APPLICATION_ORIGINS, DEFAULT_BRAND_NAME, DEFAULT_COMPANY_NAME, OEM_CONFIG_ENV,
  OFFICIAL_INFERENCE_ORIGIN, OFFICIAL_PLATFORM_ORIGIN,
  defaultOemConfig, oemBootConfig, oemConfigPath, readOemConfig, resolveOemConfig, resolveOemEnvironment,
} from '../src/config.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(content: string | undefined): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-oem-'))
  directories.push(directory)
  const filename = join(directory, 'oem.json')
  if (content !== undefined) await writeFile(filename, content)
  return filename
}

describe('resolveOemEnvironment', () => {
  it('reads the SDKWork lifecycle keys before the dev flags', () => {
    expect(resolveOemEnvironment({})).toBe('production')
    expect(resolveOemEnvironment({ SDKWORK_BIRDCODER_ENVIRONMENT: 'development' })).toBe('development')
    expect(resolveOemEnvironment({ SDKWORK_PROFILE_ID: 'standalone.staging' })).toBe('staging')
    expect(resolveOemEnvironment({ SDKWORK_ENVIRONMENT: 'test' })).toBe('testing')
    expect(resolveOemEnvironment({ NODE_ENV: 'development' })).toBe('development')
    expect(resolveOemEnvironment({ DSH_DESKTOP_DEV_APP: '1' })).toBe('development')
    expect(resolveOemEnvironment({ SDKWORK_BIRDCODER_ENVIRONMENT: 'production', NODE_ENV: 'development' })).toBe('production')
  })
})

describe('resolveOemConfig', () => {
  it('ships the BirdCoder service origins, brand, and application origin without a profile', () => {
    expect(resolveOemConfig(undefined)).toEqual(defaultOemConfig())
    expect(defaultOemConfig()).toEqual({
      environment: 'production',
      brand: { name: DEFAULT_BRAND_NAME, companyName: DEFAULT_COMPANY_NAME },
      application: { origins: [...DEFAULT_APPLICATION_ORIGINS] },
      sdkwork: {
        iamBaseUrl: 'https://api.birdcoder.com',
        iamAuthorizeBaseUrl: 'https://platform.birdcoder.com',
        iamClientId: 'birdcoder',
        iamRedirectUri: 'birdcoder://auth/callback',
      },
      deepseek: {
        platformOrigin: 'https://platform.birdcoder.com',
        inferenceOrigin: 'https://api.birdcoder.com',
        allowLoopbackHttp: false,
        allowInsecureHttp: false,
        rewriteBrowserOrigin: false,
        messagesBaseUrl: 'https://api.birdcoder.com/anthropic',
        webSearchBaseUrl: 'https://api.birdcoder.com/anthropic/v1',
        webApiBaseUrl: 'https://api.birdcoder.com/v1/tools',
      },
    })
    expect(defaultOemConfig().application.origins).toEqual(['https://birdcoder.com'])
  })

  it('follows the development tier with -dev HTTP service domains', () => {
    const config = resolveOemConfig(undefined, 'test', 'development')
    expect(config.environment).toBe('development')
    expect(config.deepseek).toMatchObject({
      platformOrigin: 'http://platform-dev.birdcoder.com',
      inferenceOrigin: 'http://api-dev.birdcoder.com',
      allowInsecureHttp: true,
      messagesBaseUrl: 'http://api-dev.birdcoder.com/anthropic',
      webSearchBaseUrl: 'http://api-dev.birdcoder.com/anthropic/v1',
      webApiBaseUrl: 'http://api-dev.birdcoder.com/v1/tools',
    })
    expect(config.sdkwork.iamAuthorizeBaseUrl).toBe('http://platform-dev.birdcoder.com')
    // The IAM app-api origin stays the env profile's job; the production
    // constant lets `resolveIamBaseUrl` defer to `api-dev`.
    expect(config.sdkwork.iamBaseUrl).toBe('https://api.birdcoder.com')
  })

  it('never admits plain HTTP outside the development lifecycle', () => {
    expect(resolveOemConfig({ deepseek: { allowInsecureHttp: true } }).deepseek.allowInsecureHttp).toBe(false)
    expect(resolveOemConfig({
      sdkwork: { iamAuthorizeBaseUrl: 'https://platform-dev.birdcoder.com' },
      deepseek: {
        platformOrigin: 'https://platform-dev.birdcoder.com',
        inferenceOrigin: 'https://api-dev.birdcoder.com',
        allowInsecureHttp: false,
      },
    }, 'test', 'development').deepseek.allowInsecureHttp).toBe(false)
    expect(() => resolveOemConfig({ deepseek: { platformOrigin: 'http://platform-dev.birdcoder.com' } }))
      .toThrow(/must be an HTTPS origin/)
  })

  it('layers one environments.<tier> section over the shared root fields', () => {
    const raw = {
      brand: { name: 'Acme' },
      deepseek: { rewriteBrowserOrigin: true },
      environments: {
        development: {
          sdkwork: { iamAuthorizeBaseUrl: 'http://platform-dev.acme.test' },
          deepseek: {
            platformOrigin: 'http://platform-dev.acme.test',
            inferenceOrigin: 'http://api-dev.acme.test',
            allowInsecureHttp: true,
          },
        },
        production: {
          deepseek: {
            platformOrigin: 'https://platform.acme.test',
            inferenceOrigin: 'https://api.acme.test',
          },
        },
      },
    }
    const development = resolveOemConfig(raw, 'profile', 'development')
    expect(development.deepseek).toMatchObject({
      platformOrigin: 'http://platform-dev.acme.test',
      inferenceOrigin: 'http://api-dev.acme.test',
      rewriteBrowserOrigin: true,
      messagesBaseUrl: 'http://api-dev.acme.test/anthropic',
    })
    expect(development.brand.name).toBe('Acme')
    expect(development.sdkwork.iamAuthorizeBaseUrl).toBe('http://platform-dev.acme.test')

    const production = resolveOemConfig(raw, 'profile', 'production')
    expect(production.deepseek).toMatchObject({
      platformOrigin: 'https://platform.acme.test',
      inferenceOrigin: 'https://api.acme.test',
      rewriteBrowserOrigin: true,
    })
    expect(production.sdkwork.iamAuthorizeBaseUrl).toBe('https://platform.birdcoder.com')
  })

  it('rejects an unknown environments key', () => {
    expect(() => resolveOemConfig({ environments: { preview: {} } }))
      .toThrow(/environments\.preview is not a supported lifecycle/)
  })

  it('refuses production BirdCoder endpoints in a non-production launch', () => {
    expect(() => resolveOemConfig({
      deepseek: { platformOrigin: 'https://platform.birdcoder.com' },
    }, 'test', 'development')).toThrow(/cannot target a production BirdCoder endpoint/)
    expect(() => resolveOemConfig({
      sdkwork: { iamAuthorizeBaseUrl: 'https://platform.birdcoder.com' },
    }, 'test', 'staging')).toThrow(/cannot target a production BirdCoder endpoint/)
    expect(() => resolveOemConfig({
      sdkwork: { iamBaseUrl: 'https://api.birdcoder.com' },
    }, 'test', 'testing')).toThrow(/cannot target a production BirdCoder endpoint/)
  })

  it('maps testing and staging to their own -test / -staging domains', () => {
    expect(defaultOemConfig('testing').deepseek).toMatchObject({
      platformOrigin: 'https://platform-test.birdcoder.com',
      inferenceOrigin: 'https://api-test.birdcoder.com',
      allowInsecureHttp: false,
    })
    expect(defaultOemConfig('staging').deepseek).toMatchObject({
      platformOrigin: 'https://platform-staging.birdcoder.com',
      inferenceOrigin: 'https://api-staging.birdcoder.com',
    })
  })

  it('can still restore the official DeepSeek origins explicitly', () => {
    const config = resolveOemConfig({
      deepseek: {
        platformOrigin: OFFICIAL_PLATFORM_ORIGIN,
        inferenceOrigin: OFFICIAL_INFERENCE_ORIGIN,
      },
    })
    expect(config.deepseek.platformOrigin).toBe(OFFICIAL_PLATFORM_ORIGIN)
    expect(config.deepseek.messagesBaseUrl).toBe('')
    expect(config.deepseek.webSearchBaseUrl).toBe('')
    expect(config.deepseek.webApiBaseUrl).toBe('')
  })

  it('replaces the SDKWork IAM origins and rejects unusable values', () => {
    const config = resolveOemConfig({
      sdkwork: { iamBaseUrl: 'https://iam.acme.test/', iamAuthorizeBaseUrl: 'https://platform.acme.test' },
    })
    expect(config.sdkwork).toEqual({
      iamBaseUrl: 'https://iam.acme.test',
      iamAuthorizeBaseUrl: 'https://platform.acme.test',
      iamClientId: 'birdcoder',
      iamRedirectUri: 'birdcoder://auth/callback',
    })
    expect(() => resolveOemConfig({ sdkwork: { iamBaseUrl: 'http://iam.acme.test' } }))
      .toThrow(/sdkwork\.iamBaseUrl/)
    expect(() => resolveOemConfig({ sdkwork: { iamBaseUrl: 'https://iam.acme.test/app' } }))
      .toThrow(/sdkwork\.iamBaseUrl/)
    expect(() => resolveOemConfig({ sdkwork: { iamAuthorizeBaseUrl: 'http://platform.acme.test' } }))
      .toThrow(/sdkwork\.iamAuthorizeBaseUrl/)
  })

  it('repoints the desktop OAuth client and its deep-link callback', () => {
    const config = resolveOemConfig({
      sdkwork: { iamClientId: ' acme-coder ', iamRedirectUri: ' acme://auth/callback ' },
    })
    expect(config.sdkwork.iamClientId).toBe('acme-coder')
    expect(config.sdkwork.iamRedirectUri).toBe('acme://auth/callback')
    // The API tenant identity is a different key: repointing the OAuth client
    // must not move the `ui-sdkwork-env` app id the generated client reports.
    expect(config.sdkwork.iamBaseUrl).toBe('https://api.birdcoder.com')
  })

  it('rejects an unusable OAuth client id or deep-link callback', () => {
    for (const iamClientId of ['Acme', 'acme coder', '', 'a'.repeat(65), '../etc']) {
      expect(() => resolveOemConfig({ sdkwork: { iamClientId } })).toThrow(/sdkwork\.iamClientId/)
    }
    for (const iamRedirectUri of [
      'https://app.acme.test/auth/callback',
      'http://app.acme.test/auth/callback',
      'acme:auth/callback',
      'acme://',
      'acme://auth/callback?code=x',
      'acme://user:secret@auth/callback',
      'not a uri',
    ]) {
      expect(() => resolveOemConfig({ sdkwork: { iamRedirectUri } })).toThrow(/sdkwork\.iamRedirectUri/)
    }
  })

  it('replaces the application origins and rejects unusable entries', () => {
    const config = resolveOemConfig({ application: { origins: ['https://app.acme.test/', 'https://app.acme.test'] } })
    expect(config.application.origins).toEqual(['https://app.acme.test'])
    expect(() => resolveOemConfig({ application: { origins: ['http://app.acme.test'] } }))
      .toThrow(/application\.origins/)
    expect(() => resolveOemConfig({ application: { origins: ['https://app.acme.test/app'] } }))
      .toThrow(/application\.origins/)
    expect(() => resolveOemConfig({ application: { origins: 'https://app.acme.test' } }))
      .toThrow(/must be an array/)
  })

  it('derives the model and search bases from a deployment inference origin', () => {
    const config = resolveOemConfig({
      brand: { name: ' Acme Coder ', companyName: 'Acme' },
      deepseek: { platformOrigin: 'https://platform.acme.test', inferenceOrigin: 'https://gateway.acme.test' },
    })
    expect(config.brand).toEqual({ name: 'Acme Coder', companyName: 'Acme' })
    expect(config.deepseek).toMatchObject({
      platformOrigin: 'https://platform.acme.test',
      inferenceOrigin: 'https://gateway.acme.test',
      messagesBaseUrl: 'https://gateway.acme.test/anthropic',
      webSearchBaseUrl: 'https://gateway.acme.test/anthropic/v1',
      webApiBaseUrl: 'https://gateway.acme.test/v1/tools',
    })
  })

  it('keeps an explicit endpoint base and strips its trailing slash', () => {
    const config = resolveOemConfig({
      deepseek: {
        platformOrigin: 'https://platform.acme.test',
        inferenceOrigin: 'https://gateway.acme.test',
        messagesBaseUrl: 'https://gateway.acme.test/messages/',
        webSearchBaseUrl: 'https://search.acme.test/v1/',
      },
    })
    expect(config.deepseek.messagesBaseUrl).toBe('https://gateway.acme.test/messages')
    expect(config.deepseek.webSearchBaseUrl).toBe('https://search.acme.test/v1')
  })

  it('allows an OEM login portal over the official API, but never the reverse', () => {
    // A deployment login portal issuing its own grants for the official API is
    // the reseller case: the endpoint bases stay on their official defaults.
    const portal = resolveOemConfig({
      deepseek: {
        platformOrigin: 'https://platform.acme.test',
        inferenceOrigin: OFFICIAL_INFERENCE_ORIGIN,
      },
    })
    expect(portal.deepseek.platformOrigin).toBe('https://platform.acme.test')
    expect(portal.deepseek.inferenceOrigin).toBe(OFFICIAL_INFERENCE_ORIGIN)
    expect(portal.deepseek.messagesBaseUrl).toBe('')
    // An official grant must never be forwarded to a deployment inference endpoint.
    expect(() => resolveOemConfig({
      deepseek: { platformOrigin: OFFICIAL_PLATFORM_ORIGIN, inferenceOrigin: 'https://gateway.acme.test' },
    })).toThrow(/also requires a customized/)
  })

  it('rejects a messages base outside the inference origin', () => {
    expect(() => resolveOemConfig({
      deepseek: {
        platformOrigin: 'https://platform.acme.test',
        inferenceOrigin: 'https://gateway.acme.test',
        messagesBaseUrl: 'https://other.acme.test/anthropic',
      },
    })).toThrow(/must share the origin/)
  })

  it('accepts loopback HTTP only with the explicit development switch', () => {
    expect(() => resolveOemConfig({ deepseek: { platformOrigin: 'http://127.0.0.1:7780' } }))
      .toThrow(/must be an HTTPS origin/)
    const config = resolveOemConfig({
      deepseek: {
        platformOrigin: 'http://127.0.0.1:7780',
        inferenceOrigin: 'http://127.0.0.1:7780',
        allowLoopbackHttp: true,
      },
    })
    expect(config.deepseek.platformOrigin).toBe('http://127.0.0.1:7780')
    expect(config.deepseek.messagesBaseUrl).toBe('http://127.0.0.1:7780/anthropic')
  })

  it('rejects origins carrying a path, credentials, or a non-HTTP protocol', () => {
    for (const platformOrigin of ['https://platform.acme.test/dsh', 'https://user:secret@platform.acme.test', 'ftp://platform.acme.test']) {
      expect(() => resolveOemConfig({ deepseek: { platformOrigin, inferenceOrigin: 'https://gateway.acme.test' } }))
        .toThrow(/deepseek.platformOrigin/)
    }
  })

  it('rejects an empty or oversized brand', () => {
    expect(() => resolveOemConfig({ brand: { name: '   ' } })).toThrow(/brand.name must not be empty/)
    expect(() => resolveOemConfig({ brand: { name: 'x'.repeat(65) } })).toThrow(/at most 64/)
    expect(() => resolveOemConfig({ brand: { name: 'bad\u0000name' } })).toThrow(/control characters/)
  })
})

describe('readOemConfig', () => {
  it('treats a missing file as the shipped defaults', async () => {
    const filename = await fixture(undefined)
    expect(readOemConfig(filename)).toEqual(defaultOemConfig())
    expect(readOemConfig(undefined)).toEqual(defaultOemConfig())
  })

  it('reads a UTF-8 BOM profile', async () => {
    const filename = await fixture(`\uFEFF${JSON.stringify({ brand: { name: 'Acme' } })}`)
    expect(readOemConfig(filename).brand.name).toBe('Acme')
  })

  it('fails loud on invalid JSON or a non-object document', async () => {
    const invalid = await fixture('{not json')
    expect(() => readOemConfig(invalid)).toThrow(/not valid JSON/)
    const array = await fixture('[]')
    expect(() => readOemConfig(array)).toThrow(/must be a JSON object/)
  })

  it('resolves DSH_OEM_CONFIG before the Harness-home file', () => {
    expect(oemConfigPath({}, '/home/u/.dsh')).toBe(join('/home/u/.dsh', 'oem.json'))
    expect(oemConfigPath({ [OEM_CONFIG_ENV]: '  ' }, '/home/u/.dsh')).toBe(join('/home/u/.dsh', 'oem.json'))
    expect(oemConfigPath({ [OEM_CONFIG_ENV]: '/etc/acme/oem.json' }, '/home/u/.dsh'))
      .toBe(resolve('/etc/acme/oem.json'))
  })
})

describe('oemBootConfig', () => {
  it('publishes the lifecycle, display brand, and IAM origin to the browser', () => {
    const config = resolveOemConfig({
      brand: { name: 'Acme' },
      deepseek: { platformOrigin: 'https://platform.acme.test', inferenceOrigin: 'https://gateway.acme.test' },
    })
    expect(oemBootConfig(config)).toEqual({
      environment: 'production',
      brand: { name: 'Acme', companyName: DEFAULT_COMPANY_NAME },
      sdkwork: {
        iamBaseUrl: 'https://api.birdcoder.com',
        iamAuthorizeBaseUrl: 'https://platform.birdcoder.com',
        iamClientId: 'birdcoder',
        iamRedirectUri: 'birdcoder://auth/callback',
      },
    })
  })
})
