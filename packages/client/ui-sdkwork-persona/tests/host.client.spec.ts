/**
 * Host half of ui-sdkwork-persona: the persona fields are the plugin's own
 * live Config, so the browser half can resolve the `ui-sdkwork-persona`
 * section and write the first-run choices, while the section stays off the
 * generated settings pages.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { Config, apply } from '../src/index.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig, volatileForm } from '../../../settings/settings/src/schema.ts'

describe('ui-sdkwork-persona host', () => {
  it('keeps every persona field live so the browser form can resolve the section', () => {
    // A non-volatile Config carries no live form, and an entry with no live form
    // is absent from the forms `configForms.get` resolves — the picker would
    // then load nothing and every save would be refused.
    expect(Object.keys(volatileForm(Config)?.dict ?? {})).toEqual(['role', 'interests', 'promptDismissed'])
  })

  it('resolves with no choices declared, then stores a complete choice', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    // Absence is exactly "not chosen yet": the schema defaults carry the
    // first-run gate instead of a required field failing resolution.
    expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({
      role: '', interests: [], promptDismissed: false,
    })
    await configuration.update({ role: 'learner', interests: ['postgraduate', 'recommendation'], promptDismissed: true })
    expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({
      role: 'learner', interests: ['postgraduate', 'recommendation'], promptDismissed: true,
    })
    await configuration.fiber.dispose()
  })
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin({ Config, apply })))
