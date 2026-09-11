/**
 * Browser half: register the video document renderer.
 *
 * This package is a document implementation, not a Sidebar tab type. It claims
 * the video container suffixes in `ctx.documentPreviews` and contributes the
 * matching body to the keyed `sidebar.right.tab.document` seat; the document
 * owner keeps the tab, the file read, and the viewer menu. Every import from
 * another client package here is a type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { VIDEO_BODY_ID, videoBodyDefinition } from './definition.ts'
import { VideoPreviewBody } from './VideoPlayer.tsx'
import { videoViewStore } from './store.ts'
import { en, zh } from './locales.ts'
import type { SdkworkVideoPreviewKey } from './locales.ts'

export type { VideoPlayerProps } from './VideoPlayer.tsx'
export type { SdkworkVideoPreviewKey } from './locales.ts'
export type { VideoContainer, VideoDelivery, VideoInfo, VideoObstacle, VideoReasonCode, VideoTrack, VideoTrackSummary } from './video/containers.ts'
export type { VideoView, VideoViewStore, VideoViewState } from './store.ts'

/** This package's copy namespace. */
const NS = 'sdkworkVideoPreview'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Video preview transport labels, container and codec labels, and failure lines. */
    sdkworkVideoPreview: SdkworkVideoPreviewKey
  }
}

/**
 * Required browser services: the slot registry, copy, and the document
 * implementation registry the preview owner exposes.
 */
export const inject = ['slots', 'locale', 'documentPreviews']

/**
 * Client plugin body: register the dictionaries, the renderer metadata, and the
 * keyed body that plays the file.
 * @param ctx - client root context carrying the locale, slot, and document registries.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-video-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.documentPreviews.register(videoBodyDefinition(() => t('title'))),
    'ui-sdkwork-video-preview: metadata',
  )
  const store = defineStore(videoViewStore)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: VIDEO_BODY_ID, locale: NS, store },
    VideoPreviewBody,
  )), 'ui-sdkwork-video-preview: body')
}
