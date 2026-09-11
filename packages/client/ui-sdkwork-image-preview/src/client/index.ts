/**
 * Browser half: register the image document renderer.
 *
 * This package is a document implementation, not a Sidebar tab type. It claims
 * the image suffixes in `ctx.documentPreviews` and contributes the matching body
 * to the keyed `sidebar.right.tab.document` seat; the document owner keeps the
 * tab, the file read, and the viewer menu. Every import from another client
 * package here is a type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PagedZoom } from '@deepseek-ai/dsh-client-sdkwork-office'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { IMAGE_BODY_ID, imageBodyDefinition } from './definition.ts'
import { ImageViewer } from './ImageViewer.tsx'
import { imageViewStore } from './store.ts'
import { en, zh } from './locales.ts'
import type { SdkworkImagePreviewKey } from './locales.ts'

export type { ImageViewerProps } from './ImageViewer.tsx'
export type { SdkworkImagePreviewKey } from './locales.ts'
export type { ImageDelivery, ImageFormat } from './image/formats.ts'
export type { ImageLoadFailure } from './image/load.ts'
export type { ImageRotation, ImageView, ImageViewStore, ImageViewState } from './store.ts'
export type { PagedZoom as ImageZoom }

/** This package's copy namespace. */
const NS = 'sdkworkImagePreview'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Image preview progress, zoom, rotation, metadata labels, and failure lines. */
    sdkworkImagePreview: SdkworkImagePreviewKey
  }
}

/**
 * Required browser services: the slot registry, copy, and the document
 * implementation registry the preview owner exposes.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * Client plugin body: register the dictionaries, the renderer metadata, and the
 * keyed body that draws the image.
 * @param ctx - client root context carrying the locale, slot, and document registries.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-image-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.documentPreviews.register(imageBodyDefinition(() => t('title'))),
    'ui-sdkwork-image-preview: metadata',
  )
  const store = defineStore(imageViewStore)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: IMAGE_BODY_ID, locale: NS, store },
    ImageViewer,
  )), 'ui-sdkwork-image-preview: body')
}
