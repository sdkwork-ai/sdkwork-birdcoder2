/** The SDKWork composed capability shape, declaration-merged into the seam. */

import type { DirectoryListing } from '@deepseek-ai/dsh-host-directory-picker/types'

/**
 * The composed interaction: every member of the native and browse shapes on
 * one capability, so a desktop boot serves the OS chooser and the in-app
 * primitives from a single `ctx.directoryPicker`.
 */
export interface DirectoryPickerComposedCapability {
  /** Discriminator of the merged kind. */
  kind: 'composed'
  /** Open the OS chooser and wait for the operator (the native shape). */
  pick(signal: AbortSignal): Promise<string | null>
  /** List one directory level (the browse shape). */
  list(path?: string, signal?: AbortSignal): Promise<DirectoryListing>
  /** Create one child directory under an existing parent (the browse shape). */
  createDirectory(path: string, name: string): Promise<string>
  /** Read one governed text file behind the size fence (the browse shape). */
  readTextFile(path: string, signal?: AbortSignal): Promise<string>
  /** Replace one governed text file's content behind the size fence (the browse shape). */
  writeTextFile(path: string, content: string): Promise<string>
}

/** Re-exported for declaration-merge consumers. */
export type { DirectoryPickerCapability, DirectoryPickerCapabilities } from '@deepseek-ai/dsh-host-directory-picker'
