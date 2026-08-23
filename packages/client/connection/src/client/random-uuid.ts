/** Browser-safe UUID generation for client-side wire correlation. */

import { uuid } from '@sdkwork/utils/id'

/**
 * Generate an RFC 4122 version 4 UUID via `@sdkwork/utils/id`.
 * Prefer importing `uuid` from `@sdkwork/utils/id` directly in new code.
 */
export function randomUuid(): string {
  return uuid()
}
