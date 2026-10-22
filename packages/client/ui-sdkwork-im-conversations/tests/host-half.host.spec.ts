/** Host half of the SDKWork IM chat mode plugin: the plugin is browser-only. */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-sdkwork-im-conversations host half', () => {
  it('provides no host-side behavior', () => {
    expect(apply()).toBeUndefined()
  })
})
