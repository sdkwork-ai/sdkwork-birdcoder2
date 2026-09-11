/** PowerPoint metadata registration through the document registry and the keyed body slot. */
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'

/** PowerPoint metadata and keyed body share this package-local implementation identity. */
export const PPTX_BODY_ID = '@deepseek-ai/dsh-client-ui-sdkwork-pptx-preview/pptx'

/**
 * OOXML presentation suffixes this renderer claims.
 *
 * `ppt` is claimed deliberately even though the renderer cannot draw it: the
 * legacy binary format would otherwise fall through to the plain-text reader
 * and report that a presentable file is "not text". Claiming it lets the body
 * explain the real reason and name the fix.
 */
export const PPTX_EXTENSIONS = ['pptx', 'pptm', 'ppsx', 'potx', 'ppt'] as const

/**
 * Describe the PowerPoint renderer independently from its keyed body slot.
 * @param title - locale-owned implementation name.
 * @returns the complete-file PowerPoint registration.
 */
export function pptxBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return {
    id: PPTX_BODY_ID,
    extensions: PPTX_EXTENSIONS,
    title,
    loading: 'bytes-complete',
    wrap: false,
  }
}
