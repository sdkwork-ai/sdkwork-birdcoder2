import { describe, expect, it } from 'vitest'
import { loopbackLoginEnabled } from '../src/iam-loopback-policy.ts'

describe('loopbackLoginEnabled', () => {
  it('stays off unless the OEM profile or environment opts in', () => {
    expect(loopbackLoginEnabled({ env: {}, oemEnabled: false })).toBe(false)
    expect(loopbackLoginEnabled({ env: { DSH_DESKTOP_IAM_LOOPBACK: '' }, oemEnabled: false })).toBe(false)
    expect(loopbackLoginEnabled({ env: {}, oemEnabled: true })).toBe(true)
  })

  it('lets the environment force the policy in both directions', () => {
    expect(loopbackLoginEnabled({ env: { DSH_DESKTOP_IAM_LOOPBACK: '1' }, oemEnabled: false })).toBe(true)
    expect(loopbackLoginEnabled({ env: { DSH_DESKTOP_IAM_LOOPBACK: '0' }, oemEnabled: true })).toBe(false)
    expect(loopbackLoginEnabled({ env: { DSH_DESKTOP_IAM_LOOPBACK: ' yes ' }, oemEnabled: true })).toBe(true)
  })
})
