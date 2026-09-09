/** Byte-count formatting for the editor status bar. */

/**
 * Format one byte count the status bar's way (1.2 KB, 3.4 MB).
 * @param bytes - the byte count.
 * @returns the compact human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
