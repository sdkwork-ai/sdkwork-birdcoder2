import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply } from '../src/index.ts'
import { UI_ENV_NAMESPACE } from '../src/env-settings.ts'

describe('ui-env host settings registration', () => {
  it('registers the ui-env namespace against the real settings-file provider', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-ui-env-host-'))
    await writeFile(join(home, 'settings.yaml'), [
      'ui-env:',
      '  environment: testing',
      '  testing:',
      '    apiBaseUrl: https://api.staging.sdkwork.com',
      '    appId: app-test',
      '    appKey: key-test',
      '    accessToken: tok-test',
      '',
    ].join('\n'))
    const ctx = new Context()
    await ctx.plugin(FileSettingsProvider, { dshHome: home }).await()
    await ctx.plugin({ apply, inject: ['settings'] }).await()
    const settings = ctx.get('settings') as {
      get(ns: string): unknown
      section(ns: string): unknown
    }
    const ns = settingsNamespace(UI_ENV_NAMESPACE)
    expect(settings.get(ns)).toBeDefined()
    const section = settings.section(ns) as {
      environment?: string
      testing?: { apiBaseUrl?: string; accessToken?: string }
    }
    expect(section.environment).toBe('testing')
    expect(section.testing?.apiBaseUrl).toBe('https://api.staging.sdkwork.com')
    expect(section.testing?.accessToken).toBe('tok-test')
  })
})
