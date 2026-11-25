/** The installation response decoder: the wire-boundary narrowing before any component reads it. */
import { describe, expect, it } from 'vitest'
import { decodeInstallationApplication } from '../src/client/installation-facts.ts'

const RESPONSE = {
  appId: '382418217538162688',
  tenantId: '100001',
  organizationId: '0',
  releaseScope: 'TENANT',
  environment: 'production',
  deploymentMode: 'saas',
  product: {
    name: 'Birdcoder',
    vendor: 'SDKWork',
    appKey: 'birdcoder',
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
    // The platform's own id vocabulary is authoritative, whatever its shape.
    expect(decodeInstallationApplication({ ...RESPONSE, appId: 'app_01a18b4f-6f61-7ff1-b86c-75b54995883f' }))
      .toEqual({ ...RESPONSE, appId: 'app_01a18b4f-6f61-7ff1-b86c-75b54995883f' })
    expect(decodeInstallationApplication({ ...RESPONSE, appId: '1906659d-ef4c-4b89-b72f-606512821ad7' }))
      .toEqual({ ...RESPONSE, appId: '1906659d-ef4c-4b89-b72f-606512821ad7' })
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
