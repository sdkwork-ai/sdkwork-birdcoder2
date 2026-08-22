/** Face resolution for workspace and package-local tsdown configs. */

import { afterEach, describe, expect, it } from 'vitest'
import { hostOnlyTsdownConfig, readBuildFace } from './tsdown-build-face.ts'

describe('readBuildFace', () => {
  const previous = process.env.DSH_BUILD_FACE

  afterEach(() => {
    if (previous === undefined) delete process.env.DSH_BUILD_FACE
    else process.env.DSH_BUILD_FACE = previous
  })

  it('reads the Client face from process.env when the inline env is empty', () => {
    process.env.DSH_BUILD_FACE = 'client'
    expect(readBuildFace({})).toBe('client')
    expect(readBuildFace({ env: {} })).toBe('client')
  })

  it('prefers an explicit inline env over process.env', () => {
    process.env.DSH_BUILD_FACE = 'client'
    expect(readBuildFace({ env: { DSH_BUILD_FACE: 'host' } })).toBe('host')
  })

  it('skips host-only library configs during the Client pass', () => {
    process.env.DSH_BUILD_FACE = 'client'
    const skipped = hostOnlyTsdownConfig({
      entry: ['lib/types/index.js'],
      outDir: 'lib',
    })
    expect(skipped).toEqual({ entry: '' })
  })
})
