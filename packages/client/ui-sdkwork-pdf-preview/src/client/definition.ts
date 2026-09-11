/** PDF metadata registration through the document registry and the keyed body slot. */
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'

/** PDF metadata and keyed body share this package-local implementation identity. */
export const PDF_BODY_ID = '@deepseek-ai/dsh-client-ui-sdkwork-pdf-preview/pdf'

/** Document suffix this renderer claims. */
export const PDF_EXTENSIONS = ['pdf'] as const

/**
 * Describe the PDF renderer independently from its keyed body slot.
 *
 * The registration carries no `priority`, which places it in the `extension`
 * band and therefore ahead of the builtin PDF reader. The document owner lists
 * every candidate for a suffix in its viewer menu, so the builtin reader stays
 * reachable from there rather than being replaced.
 * @param title - locale-owned implementation name.
 * @returns the complete-file PDF registration.
 */
export function pdfBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return {
    id: PDF_BODY_ID,
    extensions: PDF_EXTENSIONS,
    title,
    loading: 'bytes-complete',
    wrap: false,
  }
}
