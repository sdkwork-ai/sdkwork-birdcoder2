/** Structured failure of the SDKWork git seam. */

import type { SdkworkGitErrorCode } from './types.ts'

/**
 * Closed-vocabulary rejection raised by the git capability. The Remote
 * controller maps these codes onto the `git/*` wire vocabulary; every other
 * rejection is an infrastructure failure.
 */
export class SdkworkGitError extends Error {
  override readonly name = 'SdkworkGitError'

  /** @param code - seam failure vocabulary.
   * @param message - operator-facing explanation.
   * @param cause - underlying rejection when one exists. */
  constructor(
    readonly code: SdkworkGitErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}
