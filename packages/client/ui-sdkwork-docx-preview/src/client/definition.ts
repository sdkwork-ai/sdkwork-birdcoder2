/** Word metadata registration through the document registry and the keyed body slot. */
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'

/** Word metadata and keyed body share this package-local implementation identity. */
export const DOCX_BODY_ID = '@deepseek-ai/dsh-client-ui-sdkwork-docx-preview/docx'

/**
 * OOXML word-processing suffixes this renderer claims.
 *
 * `doc` is claimed deliberately even though the renderer cannot draw it: the
 * legacy binary format would otherwise fall through to the plain-text reader
 * and report that a presentable file is "not text". Claiming it lets the body
 * explain the real reason and name the fix.
 */
export const DOCX_EXTENSIONS = ['docx', 'docm', 'dotx', 'dotm', 'doc'] as const

/**
 * Describe the Word renderer independently from its keyed body slot.
 * @param title - locale-owned implementation name.
 * @returns the complete-file Word registration.
 */
export function docxBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return {
    id: DOCX_BODY_ID,
    extensions: DOCX_EXTENSIONS,
    title,
    loading: 'bytes-complete',
    wrap: false,
  }
}
