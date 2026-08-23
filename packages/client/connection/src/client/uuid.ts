/**
 * Generate an RFC 4122 version 4 UUID. `crypto.randomUUID` requires a secure
 * context, which custom app:// schemes may not provide, so fall back to a
 * Math.random-based v4 when it is unavailable.
 */
export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // non-secure context fall through to the v4 generator below
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const random = (Math.random() * 16) | 0
    return (part === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}
