/**
 * The system clipboard, as the workbook body uses it.
 *
 * Both directions are best-effort by design. A preview runs inside a host page
 * that may refuse clipboard access — a permission prompt the reader dismissed,
 * a non-secure origin, a browser that ships no async clipboard at all — and none
 * of those is a reason to interrupt the reader with an error: the selection is
 * still on screen and the edit log still holds the values, so a refused copy or
 * paste costs nothing that cannot be retried.
 *
 * The tab-separated format is the one a spreadsheet application puts on the
 * clipboard for a rectangle of cells, which is why a copy from this preview
 * pastes into Excel and a copy from Excel pastes back in.
 */

/**
 * Put text on the system clipboard.
 * @param text - the text to write.
 * @returns when the write has settled, whether or not it was accepted.
 */
export async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // A refused or unavailable clipboard leaves the reader's selection alone.
  }
}

/**
 * Read the system clipboard's text.
 * @returns the text, or undefined when the clipboard cannot be read.
 */
export async function readClipboard(): Promise<string | undefined> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return undefined
  }
}
