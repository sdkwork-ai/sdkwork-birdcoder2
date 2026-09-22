/**
 * Host half of ui-sdkwork-settings-menu: the GUI-onboarding acknowledgement is
 * a live field of the plugin's own Config, and the welcome step keeps it off
 * the generated settings pages.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { Config, apply } from '../src/index.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig, volatileForm } from '../../../settings/settings/src/schema.ts'

describe('ui-sdkwork-settings-menu host', () => {
  it('keeps the acknowledgement live so the browser form can resolve the section', () => {
    // A non-volatile Config carries no live form, and an entry with no live form
    // is absent from the forms `configForms.get` resolves — the welcome step
    // would then re-offer a notice the user already acknowledged.
    expect(Object.keys(volatileForm(Config)?.dict ?? {})).toEqual(['welcomeNoticeVersion'])
  })

  it('resolves with no acknowledgement declared, then accepts one', async () => {
    // `required(false)` is what lets a composition that never acknowledged
    // anything still resolve: absence is exactly "not yet acknowledged".
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    await configuration.update({ welcomeNoticeVersion: '2026.09' })
    expect(plainConfig(configuration.fiber.config)).toMatchObject({ welcomeNoticeVersion: '2026.09' })
    await configuration.fiber.dispose()
  })
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin({ Config, apply })))
