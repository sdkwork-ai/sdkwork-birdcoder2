/**
 * Browser half: register the Excel document renderer.
 *
 * This package is a document implementation, not a Sidebar tab type. It claims
 * workbook suffixes in `ctx.documentPreviews` and contributes the matching body
 * to the keyed `sidebar.right.tab.document` seat; the document owner
 * (ui-sidebar-documentpreview) keeps the tab, the file read, and the viewer
 * menu. Every import from another client package here is a type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import type { PagedViewState, PagedViewStore, PagedView, PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { XLSX_BODY_ID, xlsxBodyDefinition } from './definition.ts'
import { XlsxBody } from './XlsxBody.tsx'
import { en, zh } from './locales.ts'
import type { SdkworkXlsxPreviewKey } from './locales.ts'

// Values stay package-private unless another package needs them; the plugin
// surface is `apply`, `inject`, and the types a consumer of the seat names.
export type { XlsxBodyProps } from './XlsxBody.tsx'
export type { SdkworkXlsxPreviewKey } from './locales.ts'
export type { XlsxCell, XlsxCellFormat, XlsxSheet, XlsxWorkbook } from './xlsx/model.ts'
export type { XlsxFailureCode } from './xlsx/workbook.ts'
export type { PagedView as XlsxView, PagedViewStore as XlsxStore, PagedViewState as XlsxState, PagedZoom as XlsxZoom }

/** This package's copy namespace. */
const NS = 'sdkworkXlsxPreview'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Excel preview progress, sheet navigation, zoom, and failure lines. */
    sdkworkXlsxPreview: SdkworkXlsxPreviewKey
  }
}

/**
 * Required browser services: the slot registry, copy, and the document
 * implementation registry the preview owner exposes.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * Client plugin body: register the dictionaries, the renderer metadata, and the
 * keyed body that draws a selected sheet.
 * @param ctx - client root context carrying the locale, slot, and document registries.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-xlsx-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.documentPreviews.register(xlsxBodyDefinition(() => t('title'))),
    'ui-sdkwork-xlsx-preview: metadata',
  )
  const store = defineStore(pagedViewStore)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: XLSX_BODY_ID, locale: NS, store },
    XlsxBody,
  )), 'ui-sdkwork-xlsx-preview: body')
}
