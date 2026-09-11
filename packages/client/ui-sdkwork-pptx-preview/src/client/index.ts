/**
 * Browser half: register the PowerPoint document renderer.
 *
 * This package is a document implementation, not a Sidebar tab type. It claims
 * presentation suffixes in `ctx.documentPreviews` and contributes the matching
 * body to the keyed `sidebar.right.tab.document` seat; the document owner
 * (ui-sidebar-documentpreview) keeps the tab, the file read, and the viewer
 * menu. Every import from another client package here is a type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { PPTX_BODY_ID, pptxBodyDefinition } from './definition.ts'
import { PptxBody } from './PptxBody.tsx'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { pagedViewStore } from '@deepseek-ai/dsh-client-sdkwork-office'
import { en, zh } from './locales.ts'
import type { SdkworkPptxPreviewKey } from './locales.ts'

// Values stay package-private unless another package needs them; the plugin
// surface is `apply`, `inject`, and the types a consumer of the seat names.
export type { PptxBodyProps } from './PptxBody.tsx'
export type { SdkworkPptxPreviewKey } from './locales.ts'
export type { PagedView as PptxView, PagedViewStore as PptxStore, PagedViewState as PptxState, PagedZoom as PptxZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
export type { PptxDeck, PptxShape, PptxSlide } from './pptx/model.ts'
export type { PptxFailureCode } from './pptx/deck.ts'

/** This package's copy namespace. */
const NS = 'sdkworkPptxPreview'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** PowerPoint preview progress, navigation, zoom, and failure lines. */
    sdkworkPptxPreview: SdkworkPptxPreviewKey
  }
}

/**
 * Required browser services: the slot registry, copy, and the document
 * implementation registry the preview owner exposes.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * Client plugin body: register the dictionaries, the renderer metadata, and the
 * keyed body that draws a selected slide.
 * @param ctx - client root context carrying the locale, slot, and document registries.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-pptx-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.documentPreviews.register(pptxBodyDefinition(() => t('title'))),
    'ui-sdkwork-pptx-preview: metadata',
  )
  const store = defineStore(pagedViewStore)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: PPTX_BODY_ID, locale: NS, store },
    PptxBody,
  )), 'ui-sdkwork-pptx-preview: body')
}
