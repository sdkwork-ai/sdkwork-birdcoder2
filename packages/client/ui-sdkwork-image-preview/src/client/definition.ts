/** Image metadata registration through the document registry and the keyed body slot. */
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { IMAGE_EXTENSIONS } from './image/formats.ts'

/** Image metadata and keyed body share this package-local implementation identity. */
export const IMAGE_BODY_ID = '@deepseek-ai/dsh-client-ui-sdkwork-image-preview/image'

/**
 * Suffixes this renderer claims.
 *
 * The set is wider than the builtin image reader's on purpose: the formats this
 * preview recognizes but cannot draw — HEIF, JPEG 2000, PSD, RAW, EXR, and the
 * rest — would otherwise fall through to the plain-text reader, which reports a
 * presentable file as "not text". Claiming them lets the body name the format
 * the bytes actually are and the way to convert it.
 */
export { IMAGE_EXTENSIONS }

/**
 * Describe the image renderer independently from its keyed body slot.
 * @param title - locale-owned implementation name.
 * @returns the complete-file image registration.
 */
export function imageBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return {
    id: IMAGE_BODY_ID,
    extensions: IMAGE_EXTENSIONS,
    title,
    loading: 'bytes-complete',
    wrap: false,
  }
}
