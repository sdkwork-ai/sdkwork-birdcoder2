/**
 * Browser half: register the PDF document renderer.
 *
 * This package is a document implementation, not a Sidebar tab type. It claims
 * the PDF suffix in `ctx.documentPreviews` and contributes the matching body to
 * the keyed `sidebar.right.tab.document` seat; the document owner keeps the tab,
 * the file read, and the viewer menu. Every import from another client package
 * here is a type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewState, PagedViewStore, PagedView, PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { PDF_BODY_ID, pdfBodyDefinition } from './definition.ts'
import { PdfBody } from './PdfBody.tsx'
import { en, zh } from './locales.ts'
import type { SdkworkPdfPreviewKey } from './locales.ts'

export type { PdfBodyProps } from './PdfBody.tsx'
export type { SdkworkPdfPreviewKey } from './locales.ts'
export type { PdfFailureKind } from './pdf/runtime.ts'
export type { PagedView as PdfView, PagedViewStore as PdfStore, PagedViewState as PdfState, PagedZoom as PdfZoom }

/** This package's copy namespace. */
const NS = 'sdkworkPdfPreview'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** PDF preview progress, page navigation, zoom, rotation, and failure lines. */
    sdkworkPdfPreview: SdkworkPdfPreviewKey
  }
}

/**
 * Required browser services: the slot registry, copy, and the document
 * implementation registry the preview owner exposes.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * Client plugin body: register the dictionaries, the renderer metadata, and the
 * keyed body that draws a selected page.
 * @param ctx - client root context carrying the locale, slot, and document registries.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-pdf-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.documentPreviews.register(pdfBodyDefinition(() => t('title'))),
    'ui-sdkwork-pdf-preview: metadata',
  )
  const store = defineStore(pagedViewStore)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: PDF_BODY_ID, locale: NS, store },
    PdfBody,
  )), 'ui-sdkwork-pdf-preview: body')
}
