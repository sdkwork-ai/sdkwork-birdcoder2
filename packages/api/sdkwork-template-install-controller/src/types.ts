/** Wire types for the template-install Remote namespace. */

export interface SdkworkTemplateInstallWriteRequest {
  /** Absolute directory the install is scoped to (the caller picked it). */
  readonly targetDirectory: string
  /** Target-relative posix path; every segment must be a safe single name. */
  readonly relativePath: string
  /** The file's bytes, base64-encoded (the wire carries no binary lane). */
  readonly contentBase64: string
}

export interface SdkworkTemplateInstallWriteValue {
  /** The absolute path written. */
  readonly absolutePath: string
  /** The byte count written. */
  readonly bytes: number
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The target directory is missing, not a directory, or not absolute. */
    'template-install/target-unreadable': { readonly code: string; readonly path?: string }
    /** The entry name would escape the target or is unusable on this platform. */
    'template-install/path-unsafe': { readonly code: string; readonly path?: string }
    /** The decoded content exceeds the per-file byte cap. */
    'template-install/content-too-large': { readonly code: string; readonly path?: string }
    /** The file system refused the write. */
    'template-install/write-failed': { readonly code: string; readonly path?: string }
  }
}
