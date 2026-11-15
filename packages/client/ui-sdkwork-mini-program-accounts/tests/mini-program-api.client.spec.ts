// @vitest-environment jsdom
/**
 * The generated IAM backend client construction the mini-program dialog binds:
 * the gateway origin and the shared browser-global token manager, nothing else.
 */
import { describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(() => ({ iamOauth: { iam: { oauth: {} } } })),
}))
vi.mock('@sdkwork/iam-backend-sdk', () => ({
  createClient: createClientMock,
}))

import type { AuthTokenManager } from '@sdkwork/sdk-common'
import { createMiniProgramBackendClient } from '../src/client/miniProgramApi.ts'

describe('createMiniProgramBackendClient', () => {
  it('builds one dual-token pc client for the gateway origin and token manager', () => {
    const tokenManager = { getTokens: () => ({}), setTokens: vi.fn() } as unknown as AuthTokenManager
    const client = createMiniProgramBackendClient({
      baseUrl: 'https://api.example.com',
      tokenManager,
    })
    expect(createClientMock).toHaveBeenCalledWith({
      authMode: 'dual-token',
      baseUrl: 'https://api.example.com',
      platform: 'pc',
      tokenManager,
    })
    expect(client).toMatchObject({ iamOauth: { iam: { oauth: {} } } })
  })
})
