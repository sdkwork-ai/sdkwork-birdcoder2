/** Wire and service types for the template-install capability. */

/** One bounded project-file write under a caller-picked directory. */
export interface SdkworkTemplateInstallWriteRequest {
  /** Absolute directory the install was scoped to (the caller picked it). */
  readonly targetDirectory: string
  /** Target-relative posix path; every segment must be a safe single name. */
  readonly relativePath: string
  /** The file's bytes, base64-encoded (the wire carries no binary lane). */
  readonly contentBase64: string
}

/** Acknowledged write: the absolute path on disk and the byte count. */
export interface SdkworkTemplateInstallWriteValue {
  readonly absolutePath: string
  readonly bytes: number
}

/** Closed failure vocabulary of the capability, projected onto the wire by the controller. */
export type SdkworkTemplateInstallErrorCode =
  | 'target-unreadable'
  | 'path-unsafe'
  | 'content-too-large'
  | 'write-failed'
