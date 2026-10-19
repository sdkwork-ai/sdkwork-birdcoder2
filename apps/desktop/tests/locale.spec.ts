import { describe, expect, it } from 'vitest'
import { en, formatDesktopMessage, resolveDesktopLocale, resolveDesktopStartupLocale, zh } from '../src/locale.ts'

describe('desktop locale dictionaries', () => {
  it('ships the same key set in English and Chinese', () => {
    expect(Object.keys(zh)).toEqual(Object.keys(en))
    expect(resolveDesktopLocale('zh-Hans-CN').messages).toEqual(zh)
    expect(resolveDesktopLocale('en-US').messages).toEqual(en)
    expect(resolveDesktopLocale('fr-FR').messages).toEqual(en)
  })

  it('formats named values without consuming unknown placeholders', () => {
    expect(formatDesktopMessage('{name}@{version} {missing}', { name: 'plugin', version: '1.2.3' }))
      .toBe('plugin@1.2.3 {missing}')
  })

  it('prefers an explicit supported choice, then the first supported system language', () => {
    expect(resolveDesktopStartupLocale('zh', ['en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale('EN', ['zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP', 'zh-Hant', 'en-US']).id).toBe('zh-CN')
    expect(resolveDesktopStartupLocale(null, ['en-US', 'zh-CN']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, ['ja-JP']).id).toBe('en')
    expect(resolveDesktopStartupLocale(null, []).id).toBe('en')
    expect(resolveDesktopStartupLocale('ja', ['zh-CN']).id).toBe('zh-CN')
  })

  it('replaces the shipped brand in every native string without touching other copy', () => {
    const branded = resolveDesktopLocale('en', 'Acme Coder')
    expect(branded.brand).toBe('Acme Coder')
    expect(branded.messages.aboutMenu).toBe('About Acme Coder')
    expect(branded.messages.aboutProduct).toBe('Acme Coder')
    expect(branded.messages.quitTitle).toBe('Quit Acme Coder?')
    expect(branded.messages.welcomeKeyDescription).toBe('Configure official DeepSeek models to start using Acme Coder')
    // The shared terminal command keeps its own spelling.
    expect(branded.messages.cliCommandMenu).toBe('Manage birdcoder Command…')
    expect(resolveDesktopStartupLocale('zh', [], 'Acme Coder').messages.aboutMenu).toBe('关于 Acme Coder')
  })
})
