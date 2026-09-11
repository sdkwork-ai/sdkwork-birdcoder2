// @vitest-environment jsdom
/** PDF metadata, keyed slot, dictionary, and tab-view lifetime registration. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DocumentPreviewRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/src/client/document/registry.ts'
import type { PagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import { PDF_BODY_ID, PDF_EXTENSIONS } from '../src/client/definition.ts'
import { apply } from '../src/client/index.ts'
import { apply as applyHost } from '../src/index.ts'
import { PdfBody } from '../src/client/PdfBody.tsx'
import { en, zh } from '../src/client/locales.ts'

vi.mock('../src/client/pdf/runtime.ts', () => ({
  /** Stand-in open error; the registration spec never opens a document. */
  PdfOpenError: class extends Error {},
  openPdf: vi.fn(),
}))

describe('PDF registration', () => {
  it('keeps the host half empty', () => {
    // The host body contributes nothing; calling it pins that it stays a no-op.
    applyHost()
  })

  it('claims the PDF suffix ahead of the builtin reader and removes every contribution on dispose', async () => {
    const ctx = new Context()
    const previews = new DocumentPreviewRegistry()
    previews.register({
      id: 'builtin-plain',
      extensions: ['pdf'],
      title: () => 'Plain text',
      loading: 'bytes-complete',
      wrap: false,
      priority: 'builtin',
    })
    const dictionaries = new Map<string, unknown>()
    const entries: Array<{
      name: string
      key: string
      locale: string
      store: PagedViewStore
    }> = []
    const register = vi.fn((options: typeof entries[number], component: unknown) => {
      expect(component).toBe(PdfBody)
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
      const candidates = previews.candidates('report.pdf')
      // The builtin stays registered but ranks below this package's extension band.
      expect(candidates.map(candidate => candidate.id)).toEqual([PDF_BODY_ID, 'builtin-plain'])
      expect(candidates[0]).toMatchObject({
        id: PDF_BODY_ID,
        extensions: [...PDF_EXTENSIONS],
        loading: 'bytes-complete',
        wrap: false,
      })
      expect(candidates[0]?.title()).toBe('PDF document')
      expect(previews.candidates('notes.txt').map(candidate => candidate.id)).toEqual([])
      expect(dictionaries.get('sdkworkPdfPreview')).toEqual({ zh, en })
      expect(entries[0]).toMatchObject({
        name: 'sidebar.right.tab.document',
        key: PDF_BODY_ID,
        locale: 'sdkworkPdfPreview',
      })
      const instance = entries[0]?.store.create()
      instance?.actions.index('a' as never, 3)
      instance?.actions.zoom('a' as never, 2)
      expect(instance?.getSnapshot().byTab).toEqual({ a: { index: 3, zoom: 2 } })
      instance?.actions.forget('a' as never)
      expect(instance?.getSnapshot().byTab).toEqual({})
      await fiber.dispose()
      expect(entries).toEqual([])
      expect(dictionaries.size).toBe(0)
      // Disposing this plugin must leave the builtin reader in place.
      expect(previews.candidates('report.pdf').map(candidate => candidate.id)).toEqual(['builtin-plain'])
    } finally {
      await fiber.dispose()
    }
  })
})
