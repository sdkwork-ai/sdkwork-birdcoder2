/** Structured failure of the SDKWork app build seam. */

import type { SdkworkAppBuildErrorCode } from './types.ts'

/**
 * Closed-vocabulary rejection raised by the build runner. The Remote
 * controller maps these codes onto the `app-build/*` wire vocabulary; every
 * other rejection is an infrastructure failure.
 */
export class SdkworkAppBuildError extends Error {
  override readonly name = 'SdkworkAppBuildError'

  /** @param code - seam failure vocabulary.
   * @param message - operator-facing explanation.
   * @param cause - underlying rejection when one exists. */
  constructor(
    readonly code: SdkworkAppBuildErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}
