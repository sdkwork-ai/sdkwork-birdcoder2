/**
 * Browser half: register the Word document renderer.
 *
 * This package is a document implementation, not a Sidebar tab type. It claims
 * word-processing suffixes in `ctx.documentPreviews` and contributes the
 * matching body to the keyed `sidebar.right.tab.document` seat; the document
 * owner (ui-sidebar-documentpreview) keeps the tab, the file read, and the
 * viewer menu. Every import from another client package here is a type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { DOCX_BODY_ID, docxBodyDefinition } from './definition.ts'
import { DocxBody } from './DocxBody.tsx'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import { en, zh } from './locales.ts'
import type { SdkworkDocxPreviewKey } from './locales.ts'

// Values stay package-private unless another package needs them; the plugin
// surface is `apply`, `inject`, and the types a consumer of the seat names.
export type { DocxBodyProps } from './DocxBody.tsx'
export type { SdkworkDocxPreviewKey } from './locales.ts'
export type { PagedView as DocxView, PagedViewStore as DocxStore, PagedViewState as DocxState, PagedZoom as DocxZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
export type { DocxBlock, DocxDocument, DocxParagraph, DocxSection, DocxTable } from './docx/model.ts'
export type { DocxFailureCode } from './docx/document.ts'

/** This package's copy namespace. */
const NS = 'sdkworkDocxPreview'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Word preview progress, navigation, zoom, and failure lines. */
    sdkworkDocxPreview: SdkworkDocxPreviewKey
  }
}

/**
 * Required browser services: the slot registry, copy, and the document
 * implementation registry the preview owner exposes.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * Client plugin body: register the dictionaries, the renderer metadata, and the
 * keyed body that draws the selected page.
 * @param ctx - client root context carrying the locale, slot, and document registries.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-docx-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.documentPreviews.register(docxBodyDefinition(() => t('title'))),
    'ui-sdkwork-docx-preview: metadata',
  )
  const store = defineStore(pagedViewStore)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: DOCX_BODY_ID, locale: NS, store },
    DocxBody,
  )), 'ui-sdkwork-docx-preview: body')
}
