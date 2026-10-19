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
  defaultOemConfig, oemBootConfig, oemConfigPath, readOemConfig, resolveOemConfig,
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

describe('resolveOemConfig', () => {
  it('ships the BirdCoder service origins, brand, and application origin without a profile', () => {
    expect(resolveOemConfig(undefined)).toEqual(defaultOemConfig())
    expect(defaultOemConfig()).toEqual({
      brand: { name: DEFAULT_BRAND_NAME, companyName: DEFAULT_COMPANY_NAME },
      application: { origins: [...DEFAULT_APPLICATION_ORIGINS] },
      sdkwork: { iamBaseUrl: 'https://api.birdcoder.com', iamAuthorizeBaseUrl: 'https://platform.birdcoder.com' },
      deepseek: {
        platformOrigin: 'https://platform.birdcoder.com',
        inferenceOrigin: 'https://api.birdcoder.com',
        allowLoopbackHttp: false,
        rewriteBrowserOrigin: false,
        messagesBaseUrl: 'https://api.birdcoder.com/anthropic',
        webSearchBaseUrl: 'https://api.birdcoder.com/anthropic/v1',
        webApiBaseUrl: 'https://api.birdcoder.com/v1/tools',
      },
    })
    expect(defaultOemConfig().application.origins).toEqual(['https://birdcoder.com'])
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
    })
    expect(() => resolveOemConfig({ sdkwork: { iamBaseUrl: 'http://iam.acme.test' } }))
      .toThrow(/sdkwork\.iamBaseUrl/)
    expect(() => resolveOemConfig({ sdkwork: { iamBaseUrl: 'https://iam.acme.test/app' } }))
      .toThrow(/sdkwork\.iamBaseUrl/)
    expect(() => resolveOemConfig({ sdkwork: { iamAuthorizeBaseUrl: 'http://platform.acme.test' } }))
      .toThrow(/sdkwork\.iamAuthorizeBaseUrl/)
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
  it('publishes only the display brand to the browser', () => {
    const config = resolveOemConfig({
      brand: { name: 'Acme' },
      deepseek: { platformOrigin: 'https://platform.acme.test', inferenceOrigin: 'https://gateway.acme.test' },
    })
    expect(oemBootConfig(config)).toEqual({
      brand: { name: 'Acme', companyName: DEFAULT_COMPANY_NAME },
      sdkwork: { iamBaseUrl: 'https://api.birdcoder.com', iamAuthorizeBaseUrl: 'https://platform.birdcoder.com' },
    })
  })
})
