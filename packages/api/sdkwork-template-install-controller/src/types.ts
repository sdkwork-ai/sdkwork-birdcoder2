/** Wire types for the SDKWork template Remote namespace. */

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

/** One regular file under an app directory the caller asked to package. */
export interface SdkworkTemplateFileEntry {
  /** Directory-relative posix path, no leading slash. */
  readonly path: string
  /** Size in bytes. */
  readonly size: number
}

export interface SdkworkTemplateListFilesRequest {
  /** Absolute app directory to walk. */
  readonly directory: string
}

export interface SdkworkTemplateListFilesValue {
  readonly files: readonly SdkworkTemplateFileEntry[]
  /** True when a file-count or depth bound omitted entries. */
  readonly truncated: boolean
}

export interface SdkworkTemplateReadFilesRequest {
  /** Absolute app directory the paths are relative to. */
  readonly directory: string
  /** Directory-relative posix paths; each a clean chain of single names. */
  readonly paths: readonly string[]
}

export interface SdkworkTemplateReadFileValue {
  readonly path: string
  readonly contentBase64: string
  readonly bytes: number
}

export interface SdkworkTemplateReadFilesValue {
  readonly files: readonly SdkworkTemplateReadFileValue[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The target directory is missing, not a directory, or not absolute. */
    'template-install/target-unreadable': { readonly code: string; readonly path?: string }
    /** The source app directory is missing, not a directory, or not absolute. */
    'template-install/source-unreadable': { readonly code: string; readonly path?: string }
    /** The entry name would escape the base or is unusable on this platform. */
    'template-install/path-unsafe': { readonly code: string; readonly path?: string }
    /** The decoded content exceeds a per-file or per-batch byte cap. */
    'template-install/content-too-large': { readonly code: string; readonly path?: string }
    /** The file system refused the write. */
    'template-install/write-failed': { readonly code: string; readonly path?: string }
    /** The file system refused the read. */
    'template-install/read-failed': { readonly code: string; readonly path?: string }
  }
}
