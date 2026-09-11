// @vitest-environment jsdom
/** Image metadata, keyed slot, dictionary, and tab-view lifetime registration. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DocumentPreviewRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/document/registry.ts'
import { IMAGE_BODY_ID, IMAGE_EXTENSIONS } from '../src/client/definition.ts'
import { apply } from '../src/client/index.ts'
import { ImageViewer } from '../src/client/ImageViewer.tsx'
import { en, zh } from '../src/client/locales.ts'

describe('Image registration', () => {
  it('claims the image suffixes ahead of the builtin reader and removes every contribution on dispose', async () => {
    const ctx = new Context()
    const previews = new DocumentPreviewRegistry()
    previews.register({
      id: 'builtin-image',
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'],
      title: () => 'Image',
      loading: 'bytes-complete',
      wrap: false,
      priority: 'builtin',
    })
    const dictionaries = new Map<string, unknown>()
    const entries: Array<{ name: string; key: string; locale: string }> = []
    const register = vi.fn((options: typeof entries[number], component: unknown) => {
      expect(component).toBe(ImageViewer)
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
      // The builtin stays registered but ranks below this package's extension band.
      expect(previews.candidates('photo.png').map(candidate => candidate.id))
        .toEqual([IMAGE_BODY_ID, 'builtin-image'])
      expect(previews.candidates('photo.tif').map(candidate => candidate.id)).toEqual([IMAGE_BODY_ID])
      expect(previews.candidates('scan.heic').map(candidate => candidate.id)).toEqual([IMAGE_BODY_ID])
      expect(previews.candidates('photo.png')[0]).toMatchObject({
        id: IMAGE_BODY_ID,
        extensions: [...IMAGE_EXTENSIONS],
        loading: 'bytes-complete',
        wrap: false,
      })
      const ranked = previews.candidates('photo.png')
      expect(ranked[0]?.title()).toBe('Image viewer')
      // The viewer menu lists every candidate for a suffix, so this renderer's
      // name has to differ from the builtin reader's own 'Image': two identical
      // names would leave the reader unable to tell which one is which.
      expect(ranked[0]?.title()).not.toBe(ranked[1]?.title())
      expect(dictionaries.get('sdkworkImagePreview')).toEqual({ zh, en })
      expect(entries[0]).toMatchObject({
        name: 'sidebar.right.tab.document',
        key: IMAGE_BODY_ID,
        locale: 'sdkworkImagePreview',
      })
      await fiber.dispose()
      expect(entries).toEqual([])
      expect(dictionaries.size).toBe(0)
      // Disposing this plugin must leave the builtin reader in place.
      expect(previews.candidates('photo.png').map(candidate => candidate.id)).toEqual(['builtin-image'])
    } finally {
      await fiber.dispose()
    }
  })
})
