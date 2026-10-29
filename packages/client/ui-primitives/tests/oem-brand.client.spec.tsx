// @vitest-environment jsdom
/** The OEM page projection drives the fork wordmark; malformed values fall back to the shipped brand. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { BirdWordmark } from '../src/BirdWordmark.tsx'
import {
  DEFAULT_BRAND_NAME, DEFAULT_IAM_CLIENT_ID, DEFAULT_IAM_REDIRECT_URI, OEM_BOOT_GLOBAL,
  readOemBrandName, readOemEnvironment, readOemIamAuthorizeBaseUrl, readOemIamBaseUrl, readOemIamClientId,
  readOemIamRedirectUri,
} from '../src/oem-brand.ts'

const BOOT = { brand: { name: 'Acme Coder', companyName: 'Acme' } }

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(globalThis, OEM_BOOT_GLOBAL)
})

describe('readOemBrandName', () => {
  it('falls back to the shipped brand without a projection or with a malformed one', () => {
    expect(readOemBrandName()).toBe(DEFAULT_BRAND_NAME)
    expect(readOemBrandName({ brand: { name: '   ' } })).toBe(DEFAULT_BRAND_NAME)
    expect(readOemBrandName({ brand: { name: 7 } })).toBe(DEFAULT_BRAND_NAME)
    expect(readOemBrandName({ brand: { name: 'bad\u0000name' } })).toBe(DEFAULT_BRAND_NAME)
    expect(readOemBrandName({ brand: { name: 'x'.repeat(65) } })).toBe(DEFAULT_BRAND_NAME)
  })

  it('reads the brand from a complete projection and ignores unrelated fields', () => {
    expect(readOemBrandName(BOOT)).toBe('Acme Coder')
    expect(readOemBrandName({ brand: { name: 'Acme' }, extra: true })).toBe('Acme')
    expect(readOemBrandName({ brand: { name: 'Acme' } })).toBe('Acme')
  })
})

describe('readOemIamBaseUrl', () => {
  it('reads a valid IAM origin and rejects malformed values', () => {
    expect(readOemIamBaseUrl({ sdkwork: { iamBaseUrl: 'https://iam.acme.test' } })).toBe('https://iam.acme.test')
    expect(readOemIamBaseUrl({ sdkwork: { iamBaseUrl: 'https://iam.acme.test/' } })).toBe('https://iam.acme.test')
    expect(readOemIamBaseUrl({ sdkwork: { iamBaseUrl: 'https://iam.acme.test/app' } })).toBeUndefined()
    expect(readOemIamBaseUrl({ sdkwork: { iamBaseUrl: 'ftp://iam.acme.test' } })).toBeUndefined()
    expect(readOemIamBaseUrl({ sdkwork: { iamBaseUrl: 7 } })).toBeUndefined()
    expect(readOemIamBaseUrl({ brand: { name: 'Acme' } })).toBeUndefined()
    expect(readOemIamBaseUrl()).toBeUndefined()
  })

  it('reads the hosted authorization origin independently', () => {
    expect(readOemIamAuthorizeBaseUrl({
      sdkwork: { iamBaseUrl: 'https://api.acme.test', iamAuthorizeBaseUrl: 'https://platform.acme.test' },
    })).toBe('https://platform.acme.test')
    expect(readOemIamAuthorizeBaseUrl({ sdkwork: { iamBaseUrl: 'https://api.acme.test' } })).toBeUndefined()
  })

  it('reads the resolved lifecycle and rejects unknown values', () => {
    expect(readOemEnvironment({ environment: 'development' })).toBe('development')
    expect(readOemEnvironment({ environment: 'staging' })).toBe('staging')
    expect(readOemEnvironment({ environment: 'preview' })).toBeUndefined()
    expect(readOemEnvironment({})).toBeUndefined()
  })
})

describe('readOemIamClientId', () => {
  it('reads a valid OAuth client id and rejects malformed values', () => {
    expect(readOemIamClientId({ sdkwork: { iamClientId: 'acme-coder' } })).toBe('acme-coder')
    expect(readOemIamClientId({ sdkwork: { iamClientId: ' acme-coder ' } })).toBe('acme-coder')
    for (const value of ['Acme', 'acme coder', '', 'a'.repeat(65), 7]) {
      expect(readOemIamClientId({ sdkwork: { iamClientId: value } })).toBeUndefined()
    }
    expect(readOemIamClientId({ brand: { name: 'Acme' } })).toBeUndefined()
    expect(readOemIamClientId()).toBeUndefined()
    expect(DEFAULT_IAM_CLIENT_ID).toBe('birdcoder')
  })
})

describe('readOemIamRedirectUri', () => {
  it('reads a custom-scheme callback and rejects values the desktop cannot receive', () => {
    expect(readOemIamRedirectUri({ sdkwork: { iamRedirectUri: 'acme://auth/callback' } })).toBe('acme://auth/callback')
    expect(readOemIamRedirectUri({ sdkwork: { iamRedirectUri: ' acme://auth/callback ' } })).toBe('acme://auth/callback')
    for (const value of [
      'https://app.acme.test/auth/callback',
      'http://app.acme.test/auth/callback',
      'acme:auth/callback',
      'acme://',
      'acme://user:secret@auth/callback',
      'acme://auth/callback?code=x',
      'not a uri',
      7,
    ]) {
      expect(readOemIamRedirectUri({ sdkwork: { iamRedirectUri: value } })).toBeUndefined()
    }
    expect(readOemIamRedirectUri({ sdkwork: {} })).toBeUndefined()
    expect(readOemIamRedirectUri()).toBeUndefined()
    expect(DEFAULT_IAM_REDIRECT_URI).toBe('birdcoder://auth/callback')
  })
})

describe('BirdWordmark', () => {
  it('renders the page brand by default and steps the type down for long names', () => {
    Reflect.set(globalThis, OEM_BOOT_GLOBAL, BOOT)
    const short = render(<BirdWordmark />)
    expect(short.container.querySelector('text')?.textContent).toBe('Acme Coder')
    short.unmount()

    const long = { ...BOOT, brand: { name: 'Acme Coder Enterprise Edition', companyName: 'Acme' } }
    Reflect.set(globalThis, OEM_BOOT_GLOBAL, long)
    const rendered = render(<BirdWordmark />)
    expect(rendered.container.querySelector('text')?.textContent).toBe('Acme Coder Enterprise Edition')
    expect(rendered.container.querySelector('text')?.getAttribute('font-size')).toBe('15')
    rendered.unmount()
  })

  it('keeps the shipped text and box when no projection exists', () => {
    const rendered = render(<BirdWordmark />)
    expect(rendered.container.querySelector('text')?.textContent).toBe(DEFAULT_BRAND_NAME)
    expect(rendered.container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 156 24')
  })
})
