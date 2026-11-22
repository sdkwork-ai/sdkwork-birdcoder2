/**
 * The capability's own error: a closed code plus the path it is about. The
 * controller projects the code onto the `sdkwork-scaffold-install/*` wire
 * vocabulary, so no class identity crosses the Remote boundary.
 */
import type { SdkworkScaffoldInstallErrorCode } from './types.ts'

export class SdkworkScaffoldInstallError extends Error {
  readonly code: SdkworkScaffoldInstallErrorCode
  readonly path: string | undefined

  constructor(
    code: SdkworkScaffoldInstallErrorCode,
    message: string,
    path?: string,
  ) {
    super(message)
    this.name = 'SdkworkScaffoldInstallError'
    this.code = code
    this.path = path
  }
}
