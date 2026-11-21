import { describe, expect, it } from 'vitest'
import { foldSdkworkSurfaceIdentity } from '../src/index.ts'

describe('foldSdkworkSurfaceIdentity', () => {
  it('fills the canonical names the page projection reads', () => {
    const loaded: Record<string, string> = {
      VITE_SDKWORK_APPLICATION_CODE: 'birdcoder2',
      VITE_SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
      VITE_SDKWORK_BIRDCODER_PROFILE_ID: 'cloud.production',
      VITE_SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.sdkwork.com',
      SDKWORK_ACCESS_TOKEN: 'token',
    }
    expect(foldSdkworkSurfaceIdentity(loaded)).toMatchObject({
      SDKWORK_APPLICATION_CODE: 'birdcoder2',
      SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
      SDKWORK_BIRDCODER_PROFILE_ID: 'cloud.production',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.sdkwork.com',
      SDKWORK_ACCESS_TOKEN: 'token',
    })
    expect(loaded.SDKWORK_BIRDCODER_ENVIRONMENT).toBe('production')
  })

  it('keeps a canonical value the surface already declares', () => {
    const loaded = {
      VITE_SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.sdkwork.com',
      SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL: 'https://api.birdcoder.com',
    }
    expect(foldSdkworkSurfaceIdentity(loaded).SDKWORK_BIRDCODER_PLATFORM_API_GATEWAY_HTTP_URL)
      .toBe('https://api.birdcoder.com')
  })

  it('fills a blank canonical value and skips blank transport values', () => {
    const loaded: Record<string, string> = {
      SDKWORK_BIRDCODER_ENVIRONMENT: '   ',
      VITE_SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
      VITE_SDKWORK_ACCESS_TOKEN: '  ',
    }
    expect(foldSdkworkSurfaceIdentity(loaded)).toMatchObject({
      SDKWORK_BIRDCODER_ENVIRONMENT: 'production',
    })
    expect(loaded).not.toHaveProperty('SDKWORK_ACCESS_TOKEN')
  })

  it('leaves unrelated names alone', () => {
    const loaded = {
      VITE_APP_TITLE: 'BirdCoder',
      SDKWORK_ACCESS_TOKEN: 'token',
    }
    expect(foldSdkworkSurfaceIdentity(loaded)).toEqual(loaded)
  })
})
