/**
 * Copy and download helpers for the dialog.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */

/**
 * Put text on the clipboard, falling back to a temporary selection when the
 * async Clipboard API is unavailable (non-secure origins, iframes).
 * @param text - text to copy.
 * @returns whether the copy succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Clipboard API denied; the selection fallback below is still available.
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(area)
  return copied
}

/**
 * Save text as a file.
 * @param fileName - download name.
 * @param text - file content.
 */
export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() =>{  URL.revokeObjectURL(url) }, 1_000)
}

/**
 * Last path segment of a symbolic path.
 * @param path - symbolic path with either separator.
 * @param separator - platform separator.
 * @returns the file name.
 */
export function baseName(path: string, separator: '\\' | '/'): string {
  const index = path.lastIndexOf(separator)
  return index < 0 ? path : path.slice(index + 1)
}
