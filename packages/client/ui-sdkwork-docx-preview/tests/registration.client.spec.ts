/** Word metadata, keyed slot, dictionary, and tab-view lifetime registration. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DocumentPreviewRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/document/registry.ts'
import type { PagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import { DOCX_BODY_ID, DOCX_EXTENSIONS } from '../src/client/definition.ts'
import { apply } from '../src/client/index.ts'
import { DocxBody } from '../src/client/DocxBody.tsx'
import { en, zh } from '../src/client/locales.ts'

describe('Word registration', () => {
  it('claims the word-processing suffixes and removes every contribution on dispose', async () => {
    const ctx = new Context()
    const previews = new DocumentPreviewRegistry()
    const dictionaries = new Map<string, unknown>()
    const entries: Array<{
      name: string
      key: string
      locale: string
      store: PagedViewStore
    }> = []
    const register = vi.fn((options: typeof entries[number], component: unknown) => {
      expect(component).toBe(DocxBody)
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
      for (const suffix of ['book.docx', 'book.docm', 'book.dotx', 'book.dotm', 'book.doc']) {
        expect(previews.candidates(suffix)[0]?.id).toBe(DOCX_BODY_ID)
      }
      expect(previews.candidates('book.docx')[0]).toMatchObject({
        id: DOCX_BODY_ID,
        extensions: [...DOCX_EXTENSIONS],
        loading: 'bytes-complete',
        wrap: false,
      })
      // An ordinary extension registration outranks the builtin band.
      expect(previews.candidates('book.docx')[0]?.priority).toBeUndefined()
      expect(previews.candidates('book.docx')[0]?.title()).toBe('Word document')
      expect(previews.candidates('notes.txt')).toEqual([])
      expect(dictionaries.get('sdkworkDocxPreview')).toEqual({ zh, en })
      expect(entries[0]).toMatchObject({
        name: 'sidebar.right.tab.document',
        key: DOCX_BODY_ID,
        locale: 'sdkworkDocxPreview',
      })
      const instance = entries[0].store.create()
      instance.actions.index('a' as never, 3)
      instance.actions.zoom('a' as never, 2)
      expect(instance.getSnapshot().byTab).toEqual({ a: { index: 3, zoom: 2 } })
      instance.actions.zoom('a' as never, 'fit')
      expect(instance.getSnapshot().byTab).toEqual({ a: { index: 3, zoom: 'fit' } })
      instance.actions.index('b' as never, 2)
      instance.actions.forget('a' as never)
      expect(instance.getSnapshot().byTab).toEqual({ b: { index: 2, zoom: 'fit' } })
      await fiber.dispose()
      expect(previews.getSnapshot()).toEqual([])
      expect(entries).toEqual([])
      expect(dictionaries.size).toBe(0)
    } finally {
      await fiber.dispose()
    }
  })
})
