/** Host half of the SDKWork IM contacts mode plugin: the plugin is browser-only. */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-sdkwork-im-contacts host half', () => {
  it('provides no host-side behavior', () => {
    expect(apply()).toBeUndefined()
  })
})
