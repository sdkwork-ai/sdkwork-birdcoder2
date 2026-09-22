/**
 * Host half of ui-sdkwork-iam: the presentation toggles resolve as a live
 * section carrying the schema defaults, and the account surface keeps the
 * section off the generated settings pages.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { Config, apply } from '../src/index.ts'
import {
  DEFAULT_UI_IAM_SETTINGS, UI_IAM_OAUTH_LOGIN_FIELD, UI_IAM_PRESENTATION_FIELD, UI_IAM_QR_LOGIN_FIELD,
} from '../src/iam-settings.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig, volatileForm } from '../../../settings/settings/src/schema.ts'

describe('ui-sdkwork-iam host settings registration', () => {
  it('resolves the ui-sdkwork-iam namespace with its schema defaults', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    expect(plainConfig(configuration.fiber.config)).toMatchObject(DEFAULT_UI_IAM_SETTINGS)
    await configuration.fiber.dispose()
  })

  it('keeps every field live so the browser form can resolve the section', () => {
    // A Config without a live form carries no namespace: the settings service
    // skips the entry, and the browser half's `configForms.get` never resolves —
    // the account surface would then answer its own defaults in every deployment.
    expect(Object.keys(volatileForm(Config)?.dict ?? {})).toEqual([
      UI_IAM_PRESENTATION_FIELD, UI_IAM_QR_LOGIN_FIELD, UI_IAM_OAUTH_LOGIN_FIELD,
    ])
  })
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin({ Config, apply })))
