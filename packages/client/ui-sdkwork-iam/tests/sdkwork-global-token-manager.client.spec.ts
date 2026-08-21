import { afterEach, describe, expect, it } from 'vitest'
import {
  getSdkworkGlobalTokenManager,
  mergeSdkworkSessionTokens,
  resetSdkworkGlobalTokenManager,
  syncSdkworkGlobalTokenManager,
} from '../src/sdkwork-global-token-manager.ts'

describe('sdkwork-global-token-manager', () => {
  afterEach(() => {
    resetSdkworkGlobalTokenManager()
  })

  it('returns one browser-global manager instance', () => {
    const first = getSdkworkGlobalTokenManager()
    const second = getSdkworkGlobalTokenManager()
    expect(second).toBe(first)
  })

  it('merges IAM authToken with env access token', () => {
    expect(mergeSdkworkSessionTokens({ authToken: 'iam-auth' }, ' env-access ')).toEqual({
      accessToken: 'env-access',
      authToken: 'iam-auth',
    })
  })

  it('writes merged credentials into the shared manager and clears on sign-out', () => {
    syncSdkworkGlobalTokenManager({ authToken: 'iam-auth' }, 'env-access')
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({
      accessToken: 'env-access',
      authToken: 'iam-auth',
    })
    syncSdkworkGlobalTokenManager(null, '')
    expect(getSdkworkGlobalTokenManager().getTokens()).toEqual({})
  })
})
