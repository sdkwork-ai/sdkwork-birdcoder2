/**
 * Diagnostic text of one thrown value. `unknown` is the only honest catch type,
 * and both a thrown `Error` and a thrown string must reach the operator: the
 * dialog and the per-file failure rows show this text, so a non-Error rejection
 * never renders as `[object Object]`.
 */

/**
 * Render one thrown value as a single line.
 * @param error - the caught value.
 * @returns `Error.message` for an Error, JSON for an object, the string itself otherwise.
 */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error === undefined || error === null) return ''
  if (typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return '[unserializable error]'
    }
  }
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') return String(error)
  if (typeof error === 'symbol') return error.description ?? 'symbol'
  return '[unknown error]'
}
