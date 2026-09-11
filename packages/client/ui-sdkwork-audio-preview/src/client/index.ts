/**
 * Browser half: register the audio document renderer.
 *
 * This package is a document implementation, not a Sidebar tab type. It claims
 * the audio container suffixes in `ctx.documentPreviews` and contributes the
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
import { AUDIO_BODY_ID, audioBodyDefinition } from './definition.ts'
import { AudioPlayer } from './AudioPlayer.tsx'
import { audioViewStore } from './store.ts'
import { en, zh } from './locales.ts'
import type { SdkworkAudioPreviewKey } from './locales.ts'

// Values stay package-private unless another package needs them; the plugin
// surface is `apply`, `inject`, and the types a consumer of the seat names.
export type { AudioPlayerProps } from './AudioPlayer.tsx'
export type { SdkworkAudioPreviewKey } from './locales.ts'
export type { AudioContainer, AudioDelivery, AudioInfo, AudioSummaryTerms, AudioTags } from './audio/containers.ts'
export type { AudioView, AudioViewStore, AudioViewState } from './store.ts'

export { AUDIO_BODY_ID, audioBodyDefinition } from './definition.ts'

/** This package's copy namespace. */
const NS = 'sdkworkAudioPreview'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Audio preview transport labels, tag and geometry labels, and failure lines. */
    sdkworkAudioPreview: SdkworkAudioPreviewKey
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
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-audio-preview: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.effect(
    () => ctx.documentPreviews.register(audioBodyDefinition(() => t('title'))),
    'ui-sdkwork-audio-preview: metadata',
  )
  const store = defineStore(audioViewStore)
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: AUDIO_BODY_ID, locale: NS, store },
    AudioPlayer,
  )), 'ui-sdkwork-audio-preview: body')
}
