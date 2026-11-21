/** The node half contributes no Host behavior. */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-sdkwork-about node half', () => {
  it('registers nothing on the Host', () => {
    expect(apply).toBeTypeOf('function')
    apply()
  })
})
