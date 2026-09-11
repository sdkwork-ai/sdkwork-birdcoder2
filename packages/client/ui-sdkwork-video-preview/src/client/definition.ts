/** Video metadata registration through the document registry and the keyed body slot. */
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { VIDEO_EXTENSIONS } from './video/containers.ts'

/** Video metadata and keyed body share this package-local implementation identity. */
export const VIDEO_BODY_ID = '@deepseek-ai/dsh-client-ui-sdkwork-video-preview/video'

/**
 * Suffixes this renderer claims.
 *
 * Until this package existed, none of these suffixes was claimed by anything:
 * a video fell through to the plain-text reader and was reported as "not text".
 * The set is deliberately wider than the containers any browser decodes, because
 * the containers it cannot play are exactly the ones whose readers most need to
 * be told why.
 */
export { VIDEO_EXTENSIONS }

/**
 * Describe the video renderer independently from its keyed body slot.
 * @param title - locale-owned implementation name.
 * @returns the complete-file video registration.
 */
export function videoBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return {
    id: VIDEO_BODY_ID,
    extensions: VIDEO_EXTENSIONS,
    title,
    loading: 'bytes-complete',
    wrap: false,
  }
}
