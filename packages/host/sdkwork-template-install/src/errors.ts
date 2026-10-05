/**
 * The capability's own error: a closed code plus the path it is about. The
 * controller projects the code onto the `sdkwork-template-install/*` wire
 * vocabulary, so no class identity crosses the Remote boundary.
 */
export class SdkworkTemplateInstallError extends Error {
  readonly code:
    | 'target-unreadable'
    | 'path-unsafe'
    | 'content-too-large'
    | 'write-failed'
  readonly path: string | undefined

  constructor(
    code: 'target-unreadable' | 'path-unsafe' | 'content-too-large' | 'write-failed',
    message: string,
    path?: string,
  ) {
    super(message)
    this.name = 'SdkworkTemplateInstallError'
    this.code = code
    this.path = path
  }
}
