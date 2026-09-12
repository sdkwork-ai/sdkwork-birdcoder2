import { describe, expect, it } from 'vitest'

import { packageId } from '../src/index'

describe('@sdkwork/birdcoder2-mp-host', () => {
  it('exposes a stable package identity', () => {
    expect(packageId).toBe('@sdkwork/birdcoder2-mp-host')
  })
})
