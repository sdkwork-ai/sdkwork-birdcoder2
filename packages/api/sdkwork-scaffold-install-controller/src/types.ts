/** Wire types for the SDKWork scaffold Remote namespace. */

export interface SdkworkScaffoldInstallWriteRequest {
  /** Absolute directory the install is scoped to (the caller picked it). */
  readonly targetDirectory: string
  /** Target-relative posix path; every segment must be a safe single name. */
  readonly relativePath: string
  /** The file's bytes, base64-encoded (the wire carries no binary lane). */
  readonly contentBase64: string
}

export interface SdkworkScaffoldInstallWriteValue {
  /** The absolute path written. */
  readonly absolutePath: string
  /** The byte count written. */
  readonly bytes: number
}

/** One regular file under an app directory the caller asked to package. */
export interface SdkworkScaffoldFileEntry {
  /** Directory-relative posix path, no leading slash. */
  readonly path: string
  /** Size in bytes. */
  readonly size: number
}

export interface SdkworkScaffoldListFilesRequest {
  /** Absolute app directory to walk. */
  readonly directory: string
}

export interface SdkworkScaffoldListFilesValue {
  readonly files: readonly SdkworkScaffoldFileEntry[]
  /** True when a file-count or depth bound omitted entries. */
  readonly truncated: boolean
}

export interface SdkworkScaffoldReadFilesRequest {
  /** Absolute app directory the paths are relative to. */
  readonly directory: string
  /** Directory-relative posix paths; each a clean chain of single names. */
  readonly paths: readonly string[]
}

export interface SdkworkScaffoldReadFileValue {
  readonly path: string
  readonly contentBase64: string
  readonly bytes: number
}

export interface SdkworkScaffoldReadFilesValue {
  readonly files: readonly SdkworkScaffoldReadFileValue[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The target directory is missing, not a directory, or not absolute. */
    'scaffold-install/target-unreadable': { readonly code: string; readonly path?: string }
    /** The source app directory is missing, not a directory, or not absolute. */
    'scaffold-install/source-unreadable': { readonly code: string; readonly path?: string }
    /** The entry name would escape the base or is unusable on this platform. */
    'scaffold-install/path-unsafe': { readonly code: string; readonly path?: string }
    /** The decoded content exceeds a per-file or per-batch byte cap. */
    'scaffold-install/content-too-large': { readonly code: string; readonly path?: string }
    /** The file system refused the write. */
    'scaffold-install/write-failed': { readonly code: string; readonly path?: string }
    /** The file system refused the read. */
    'scaffold-install/read-failed': { readonly code: string; readonly path?: string }
  }
}
