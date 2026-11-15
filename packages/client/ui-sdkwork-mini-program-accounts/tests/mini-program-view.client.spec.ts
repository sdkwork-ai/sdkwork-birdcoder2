// @vitest-environment jsdom
/**
 * The compatibility re-exports for the mini-program view helpers: the shared
 * package owns the row projection and the copy, and this module stays a thin
 * alias.
 */
import { describe, expect, it } from 'vitest'
import {
  MINI_PROGRAM_ACCOUNT_KIND,
  MINI_PROGRAM_PROVIDER_CODE,
  resolveMiniProgramMessages,
  toMiniProgramAccount,
} from '../src/client/miniProgramView.ts'

describe('miniProgramView re-exports', () => {
  it('exposes the shared aggregate constants', () => {
    expect(MINI_PROGRAM_ACCOUNT_KIND).toBe('mini_program')
    expect(MINI_PROGRAM_PROVIDER_CODE).toBe('wechat_mini_program')
  })

  it('projects a backend row through the shared normalizer', () => {
    expect(toMiniProgramAccount({
      id: 'iamora-1',
      integrationId: 'iamoi-1',
      providerAccountId: 'wx1234567890abcdef',
      displayName: 'My mini program',
      resourceAccountKind: 'mini_program',
      enabled: 1,
    })).toMatchObject({
      miniProgramId: 'iamora-1',
      appId: 'wx1234567890abcdef',
      displayName: 'My mini program',
      integrationId: 'iamoi-1',
      enabled: true,
    })
  })

  it('resolves the shared copy for a locale tag', () => {
    expect(resolveMiniProgramMessages('en-US').title).toBe('Mini programs')
    expect(resolveMiniProgramMessages('zh-CN').title).toBe('小程序账号')
  })
})
