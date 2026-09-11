/** Excel metadata registration through the document registry and the keyed body slot. */
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'

/** Excel metadata and keyed body share this package-local implementation identity. */
export const XLSX_BODY_ID = '@deepseek-ai/dsh-client-ui-sdkwork-xlsx-preview/xlsx'

/**
 * Workbook suffixes this renderer claims.
 *
 * `xls` and `xlsb` are claimed deliberately even though the renderer cannot
 * draw them: the legacy BIFF and binary-workbook formats would otherwise fall
 * through to the plain-text reader and report that a presentable file is "not
 * text". Claiming them lets the body explain the real reason and the fix.
 */
export const XLSX_EXTENSIONS = ['xlsx', 'xlsm', 'xltx', 'xltm', 'xlsb', 'xls'] as const

/**
 * Describe the Excel renderer independently from its keyed body slot.
 * @param title - locale-owned implementation name.
 * @returns the complete-file workbook registration.
 */
export function xlsxBodyDefinition(title: () => string): DocumentPreviewDefinition {
  return {
    id: XLSX_BODY_ID,
    extensions: XLSX_EXTENSIONS,
    title,
    loading: 'bytes-complete',
    wrap: false,
  }
}
