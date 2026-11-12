/**
 * The capability's own error: a closed code plus the path it is about. The
 * controller projects the code onto the `sdkwork-template-install/*` wire
 * vocabulary, so no class identity crosses the Remote boundary.
 */
import type { SdkworkTemplateInstallErrorCode } from './types.ts'

export class SdkworkTemplateInstallError extends Error {
  readonly code: SdkworkTemplateInstallErrorCode
  readonly path: string | undefined

  constructor(
    code: SdkworkTemplateInstallErrorCode,
    message: string,
    path?: string,
  ) {
    super(message)
    this.name = 'SdkworkTemplateInstallError'
    this.code = code
    this.path = path
  }
}
