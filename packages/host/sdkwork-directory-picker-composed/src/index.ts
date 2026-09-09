/**
 * SDKWork composed backend of the directory-picker seam: one
 * `ctx.directoryPicker` implementation whose capability serves BOTH
 * interaction shapes — the native OS chooser (`pick`, the desktop workspace
 * dialog) and the browse primitives (`list`/`createDirectory`/
 * `readTextFile`/`writeTextFile`, the in-app browser and the
 * ui-sdkwork-explorer file tabs).
 *
 * Upstream's auto chooser mounts exactly one backend, so a desktop boot
 * (resolved `native`) previously refused every browse wire verb with
 * `directory-picker/unavailable`. This backend declares the merge-extensible
 * `composed` kind the seam's contract anticipates: pick delegates to the
 * native backend's chooser machinery, the browse primitives delegate to the
 * browse backend's governed filesystem implementation (size-fenced text
 * reads/writes included). Wire consumers accept `composed` beside the base
 * kinds (see the workspace-controller's capability gate).
 * @module @deepseek-ai/dsh-sdkwork-directory-picker-composed
 */

import { pickNativeDirectory } from '@deepseek-ai/dsh-host-directory-picker-native'
import BrowseDirectoryPicker from '@deepseek-ai/dsh-host-directory-picker-browse'
import type {
  DirectoryPickerCapability, DirectoryPickerCapabilities,
  DirectoryPickerComposedCapability,
} from './capability.ts'

export type {
  DirectoryPickerCapability, DirectoryPickerComposedCapability,
} from './capability.ts'

declare module '@deepseek-ai/dsh-host-directory-picker' {
  interface DirectoryPickerCapabilities {
    /** SDKWork composed interaction: native pick plus the browse primitives. */
    composed: DirectoryPickerComposedCapability
  }
}

/** The `ctx.directoryPicker` composed implementation (stable capability object per service life). */
export default class ComposedDirectoryPicker extends BrowseDirectoryPicker {
  private readonly composedCapability: DirectoryPickerCapability = {
    kind: 'composed',
    // Native pick: the same OS chooser machinery the native backend drives.
    pick: signal => pickNativeDirectory(signal),
    // Browse primitives: forward to the inherited browse implementation —
    // its governed read/write fences (1 MiB text bound, fully-qualified
    // paths, abortable operations) stay the single policy point.
    list: (path, signal) => this.browseCapability.list(path, signal),
    createDirectory: (path, name) => this.browseCapability.createDirectory(path, name),
    readTextFile: (path, signal) => this.browseCapability.readTextFile(path, signal),
    writeTextFile: (path, content) => this.browseCapability.writeTextFile(path, content),
  }

  /**
   * The composed interaction capability.
   * @returns the stable `composed` capability object.
   */
  override capability(): DirectoryPickerCapability {
    return this.composedCapability
  }
}

// The merged capabilities map is referenced only for its declaration-merge
// side effect on the type plane.
export type { DirectoryPickerCapabilities }
