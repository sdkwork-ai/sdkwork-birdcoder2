/** Host half of the IM host adapter: the plugin is browser-only. */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-sdkwork-im host half', () => {
  it('provides no host-side behavior', () => {
    expect(apply()).toBeUndefined()
  })
})
