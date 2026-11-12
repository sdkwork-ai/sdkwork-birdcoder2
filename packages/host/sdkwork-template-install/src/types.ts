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

/** One regular file under a source directory the caller asked to package. */
export interface SdkworkTemplateFileEntry {
  /** Directory-relative posix path, no leading slash. */
  readonly path: string
  /** Size in bytes (from `lstat`), used to bound read batches before dispatch. */
  readonly size: number
}

/** Request for one bounded recursive listing of a source directory. */
export interface SdkworkTemplateListFilesRequest {
  /** Absolute directory the caller wants to package (its real path is trusted). */
  readonly directory: string
}

/** Listing answer: every regular file plus whether a cap cut the walk. */
export interface SdkworkTemplateListFilesValue {
  readonly files: readonly SdkworkTemplateFileEntry[]
  /** True when the file-count or depth bound omitted entries. */
  readonly truncated: boolean
}

/** Request for one bounded batch of source-file reads. */
export interface SdkworkTemplateReadFilesRequest {
  /** Absolute directory the paths are relative to. */
  readonly directory: string
  /** Directory-relative posix paths; each must be a clean chain of names. */
  readonly paths: readonly string[]
}

/** One read file: its relative path, base64 bytes, and byte count. */
export interface SdkworkTemplateReadFileValue {
  readonly path: string
  readonly contentBase64: string
  readonly bytes: number
}

/** Read-batch answer; entries follow the requested order. */
export interface SdkworkTemplateReadFilesValue {
  readonly files: readonly SdkworkTemplateReadFileValue[]
}

/** Closed failure vocabulary of the capability, projected onto the wire by the controller. */
export type SdkworkTemplateInstallErrorCode =
  | 'target-unreadable'
  | 'source-unreadable'
  | 'path-unsafe'
  | 'content-too-large'
  | 'write-failed'
  | 'read-failed'
