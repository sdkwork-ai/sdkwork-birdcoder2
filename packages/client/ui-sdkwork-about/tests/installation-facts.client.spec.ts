/** The installation response decoder: the wire-boundary narrowing before any component reads it. */
import { describe, expect, it } from 'vitest'
import { decodeInstallationApplication } from '../src/client/installation-facts.ts'

const RESPONSE = {
  appId: 'app_registered',
  tenantId: '100001',
  organizationId: '0',
  releaseScope: 'TENANT',
  environment: 'production',
  deploymentMode: 'saas',
  product: {
    name: 'SDKWork Birdcoder',
    vendor: 'SDKWork',
    appKey: 'sdkwork-birdcoder2',
    iconUrl: 'https://cdn.sdkwork.com/icon.png',
    websiteUrl: 'https://sdkwork.com/apps/sdkwork-birdcoder',
    supportUrl: 'https://sdkwork.com/support',
    privacyPolicyUrl: 'https://sdkwork.com/privacy',
    termsOfServiceUrl: 'https://sdkwork.com/terms',
  },
}

describe('decodeInstallationApplication', () => {
  it('accepts a complete platform response', () => {
    expect(decodeInstallationApplication(RESPONSE)).toEqual(RESPONSE)
  })

  it('rejects a non-object payload', () => {
    expect(decodeInstallationApplication(null)).toBeUndefined()
    expect(decodeInstallationApplication('installation')).toBeUndefined()
  })

  it('rejects a blank required identity field', () => {
    expect(decodeInstallationApplication({ ...RESPONSE, appId: '  ' })).toBeUndefined()
    expect(decodeInstallationApplication({ ...RESPONSE, tenantId: '' })).toBeUndefined()
  })

  it('rejects an unknown release scope, environment, or deployment mode', () => {
    expect(decodeInstallationApplication({ ...RESPONSE, releaseScope: 'PLATFORM' })).toBeUndefined()
    expect(decodeInstallationApplication({ ...RESPONSE, environment: 'qa' })).toBeUndefined()
    expect(decodeInstallationApplication({ ...RESPONSE, deploymentMode: 'edge' })).toBeUndefined()
  })

  it('rejects a missing or incomplete product slice', () => {
    expect(decodeInstallationApplication({ ...RESPONSE, product: undefined })).toBeUndefined()
    expect(decodeInstallationApplication({
      ...RESPONSE,
      product: { ...RESPONSE.product, appKey: '' },
    })).toBeUndefined()
    expect(decodeInstallationApplication({
      ...RESPONSE,
      product: { ...RESPONSE.product, websiteUrl: 42 },
    })).toBeUndefined()
  })

  it('keeps empty-but-present product links', () => {
    const decoded = decodeInstallationApplication({
      ...RESPONSE,
      product: { ...RESPONSE.product, websiteUrl: '' },
    })
    expect(decoded?.product.websiteUrl).toBe('')
  })
})
