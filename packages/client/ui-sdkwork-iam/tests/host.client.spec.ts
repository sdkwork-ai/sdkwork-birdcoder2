import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { apply } from '../src/index.ts'
import { DEFAULT_UI_IAM_SETTINGS, UI_IAM_NAMESPACE } from '../src/iam-settings.ts'

describe('ui-sdkwork-iam host settings registration', () => {
  it('registers the ui-sdkwork-iam namespace against the real settings-file provider', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-ui-sdkwork-iam-host-'))
    await writeFile(join(home, 'settings.yaml'), 'ui-sdkwork-iam:\n  presentation: page\n  qrLoginEnabled: true\n')
    const ctx = new Context()
    await ctx.plugin(FileSettingsProvider, { dshHome: home }).await()
    await ctx.plugin({ apply, inject: ['settings'] }).await()
    const settings = ctx.get('settings') as {
      get(ns: string): unknown
      section(ns: string): unknown
    }
    const ns = settingsNamespace(UI_IAM_NAMESPACE)
    expect(settings.get(ns)).toBeDefined()
    const section = settings.section(ns) as { presentation?: string; qrLoginEnabled?: boolean }
    expect(section.presentation).toBe('page')
    expect(section.qrLoginEnabled).toBe(true)
  })

  it('resolves the schema defaults when the document has no ui-sdkwork-iam section', async () => {
    const home = await mkdtemp(join(tmpdir(), 'dsh-ui-sdkwork-iam-host-'))
    const ctx = new Context()
    await ctx.plugin(FileSettingsProvider, { dshHome: home }).await()
    await ctx.plugin({ apply, inject: ['settings'] }).await()
    const settings = ctx.get('settings') as { get(ns: string): unknown }
    const ns = settingsNamespace(UI_IAM_NAMESPACE)
    const resolved = settings.get(ns) as { presentation?: string; qrLoginEnabled?: boolean }
    expect(resolved.presentation).toBe(DEFAULT_UI_IAM_SETTINGS.presentation)
    expect(resolved.qrLoginEnabled).toBe(DEFAULT_UI_IAM_SETTINGS.qrLoginEnabled)
  })
})
