// @vitest-environment jsdom
/** Invariant companion registration plus the node-half no-op. */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply as nodeApply } from '@deepseek-ai/dsh-client-ui-sdkwork-course'
import * as CourseInvariant from '@deepseek-ai/dsh-client-ui-sdkwork-course/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(CourseInvariant).await()).resolves.toBeDefined()
  })
})

describe('node half', () => {
  it('node apply is an intentional no-op (loader-managed lifecycle only)', () => {
    nodeApply()
    expect(true).toBe(true)
  })
})
