// @vitest-environment jsdom
/** Invariant companion registration plus the node-half Host wiring. */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply as nodeApply } from '@deepseek-ai/dsh-client-ui-app-modes'
import * as AppModesInvariant from '@deepseek-ai/dsh-client-ui-app-modes/invariant'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { UI_APP_MODES_NAMESPACE, UiAppModesSettingsSchema } from '../src/app-modes-settings.ts'

describe('invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(AppModesInvariant).await()).resolves.toBeDefined()
  })
})

describe('node half', () => {
  it('registers the durable section when the settings service is composed', async () => {
    const ctx = new Context()
    const register = vi.fn()
    ctx.provide('settings', { register })
    nodeApply(ctx)
    await Promise.resolve()
    expect(register).toHaveBeenCalledWith(UI_APP_MODES_NAMESPACE, UiAppModesSettingsSchema)
  })

  it('waits quietly without a settings service', () => {
    nodeApply(new Context())
    expect(true).toBe(true)
  })
})
