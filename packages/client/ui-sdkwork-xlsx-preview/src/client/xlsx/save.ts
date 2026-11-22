/**
 * Handing an edited workbook back to the reader.
 *
 * The document-preview contract is read-only: the owner supplies the bytes and
 * the body has no path that writes them back, so an edited workbook leaves
 * through the browser's own download. That is the same route the PowerPoint
 * body takes, and it is why the button says "save a copy" rather than "save" —
 * the reader's file on disk is never touched.
 */

/** The MIME type of an Office Open XML workbook. */
export const WORKBOOK_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * The name a saved copy carries.
 *
 * The preview contract hands the body no file name — only an address and the
 * bytes — so the name of a saved copy is this renderer's own, exactly as the
 * PowerPoint body names its own export.
 */
export const SAVED_COPY_NAME = 'workbook.xlsx'

/**
 * Download bytes as a workbook.
 *
 * The object URL is released in the same turn as the click, because the click
 * starts the download synchronously; holding the URL would leak a blob for
 * every save of a session.
 * @param bytes - the complete package.
 * @param name - the file name to save under.
 */
export function saveCopy(bytes: Uint8Array, name: string = SAVED_COPY_NAME): void {
  // `slice` gives the Blob a buffer of its own rather than a view over the
  // parsed package, which keeps the bytes alive for exactly as long as the
  // download needs them.
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: WORKBOOK_MIME }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
