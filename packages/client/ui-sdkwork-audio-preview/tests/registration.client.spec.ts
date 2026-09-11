// @vitest-environment jsdom
/** Audio metadata, keyed slot, dictionary, and suffix-band registration. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DocumentPreviewRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/document/registry.ts'
import { AUDIO_BODY_ID, AUDIO_EXTENSIONS } from '../src/client/definition.ts'
import { apply } from '../src/client/index.ts'
import { AudioPlayer } from '../src/client/AudioPlayer.tsx'
import { en, zh } from '../src/client/locales.ts'
import { apply as applyHost } from '../src/index.ts'

describe('Audio registration', () => {
  it('claims the audio suffixes and removes every contribution on dispose', async () => {
    const ctx = new Context()
    const previews = new DocumentPreviewRegistry()
    // The builtin reader claims some of the same suffixes, so the extension band
    // has to outrank it without removing it from the viewer menu.
    previews.register({
      id: 'builtin-audio',
      extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'],
      title: () => 'Audio',
      loading: 'bytes-complete',
      wrap: false,
      priority: 'builtin',
    })
    const dictionaries = new Map<string, unknown>()
    const entries: Array<{ name: string; key: string; locale: string }> = []
    const register = vi.fn((options: typeof entries[number], component: unknown) => {
      expect(component).toBe(AudioPlayer)
      entries.push(options)
      return () => { entries.splice(entries.indexOf(options), 1) }
    })
    ctx.provide('documentPreviews', previews)
    ctx.provide('locale', {
      register: (name: string, value: unknown) => {
        dictionaries.set(name, value)
        return () => { dictionaries.delete(name) }
      },
      bind: () => makeTranslate(en),
    } as never)
    ctx.provide('slots', {
      inject: (_name: string, callback: () => () => void) => callback(),
      register,
    } as never)
    const fiber = ctx.plugin({ apply })
    try {
      await fiber.await()
      expect(previews.candidates('song.mp3').map(candidate => candidate.id))
        .toEqual([AUDIO_BODY_ID, 'builtin-audio'])
      // A suffix only this preview claims needs no ranking at all.
      expect(previews.candidates('take.wv').map(candidate => candidate.id)).toEqual([AUDIO_BODY_ID])
      expect(previews.candidates('take.tta').map(candidate => candidate.id)).toEqual([AUDIO_BODY_ID])
      expect(previews.candidates('notes.txt').map(candidate => candidate.id)).toEqual([])
      expect(previews.candidates('voice.amr').map(candidate => candidate.id)).toEqual([AUDIO_BODY_ID])
      expect(previews.candidates('song.caf').map(candidate => candidate.id)).toEqual([AUDIO_BODY_ID])
      expect(previews.candidates('song.mp3')[0]).toMatchObject({
        id: AUDIO_BODY_ID,
        extensions: [...AUDIO_EXTENSIONS],
        loading: 'bytes-complete',
        wrap: false,
      })
      expect(previews.candidates('song.mp3')[0]?.title()).toBe('Audio')
      expect(dictionaries.get('sdkworkAudioPreview')).toEqual({ zh, en })
      expect(entries[0]).toMatchObject({
        name: 'sidebar.right.tab.document',
        key: AUDIO_BODY_ID,
        locale: 'sdkworkAudioPreview',
      })
      await fiber.dispose()
      expect(entries).toEqual([])
      expect(dictionaries.size).toBe(0)
      // Disposing this plugin must leave the builtin reader in place.
      expect(previews.candidates('song.mp3').map(candidate => candidate.id)).toEqual(['builtin-audio'])
    } finally {
      await fiber.dispose()
    }
  })
})

describe('the host half', () => {
  it('contributes nothing to the host tree', () => {
    // The whole player is in the browser export, so the host entry is empty on
    // purpose. Pinning that keeps it from quietly growing a second surface that
    // no profile registers.
    expect(applyHost).not.toThrow()
  })
})
