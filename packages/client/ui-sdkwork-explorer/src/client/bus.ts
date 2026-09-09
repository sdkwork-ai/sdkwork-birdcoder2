/**
 * The explorer's cross-bundle gesture bus.
 *
 * ui-chat (file chips, file mentions, tool rows) and ui-primitives (markdown
 * links) cannot depend on this fork package, so the seam is a set of
 * cancelable DOM CustomEvents on `document` — the same cross-bundle channel
 * RailTooltip uses, named with the `sdkwork:<name>:<event>` convention:
 *
 * - `sdkwork:explorer:open-file` — detail {@link ExplorerOpenFileDetail}
 * - `sdkwork:explorer:open-diff` — detail {@link ExplorerOpenDiffDetail}
 * - `sdkwork:explorer:open-url`  — detail {@link ExplorerOpenUrlDetail}
 *
 * The explorer's apply() listens for all three. A listener that handles the
 * gesture calls `preventDefault()`, which flips `dispatchEvent`'s return to
 * false; the dispatch helper reports `true` ("claimed") in that case and the
 * caller suppresses its default behavior (the native opener / new browser
 * tab). With no listener — or with the explorer configured to pass the
 * gesture through (`native` mode) — the event returns un-prevented and the
 * historical behavior runs unchanged.
 */

/** Detail carried by `sdkwork:explorer:open-file`. */
export interface ExplorerOpenFileDetail {
  /** Workspace-resolved path (absolute when a session cwd was available). */
  path: string
  /** Session workspace root the path was resolved against, when known. */
  cwd?: string | undefined
  /** Viewport coordinates of the initiating click, for the ask-chooser bubble. */
  x?: number | undefined
  y?: number | undefined
}

/** One applied change in the form the diff tab previews (the primitive's hunk). */
export type ExplorerDiffHunk = {
  /** The changed file's path. */
  path: string
  /** Prior content, or `null` for a new file / an overwrite. */
  oldText: string | null
  /** Content after the change. */
  newText: string
}

/** Detail carried by `sdkwork:explorer:open-diff`. */
export interface ExplorerOpenDiffDetail {
  /** Workspace-resolved path of the changed file. */
  path: string
  /** Session workspace root the path was resolved against, when known. */
  cwd?: string | undefined
  /** The applied hunks of that file, in file order (at least one). */
  hunks: readonly ExplorerDiffHunk[]
}

/** Detail carried by `sdkwork:explorer:open-url`. */
export interface ExplorerOpenUrlDetail {
  /** Sanitized absolute http(s) URL of the clicked link. */
  url: string
  /** Viewport coordinates of the initiating click, for the ask-chooser bubble. */
  x?: number | undefined
  y?: number | undefined
}

/** `sdkwork:explorer:open-file` — claimable conversation-file open gesture. */
export const EXPLORER_OPEN_FILE_EVENT = 'sdkwork:explorer:open-file'

/** `sdkwork:explorer:open-diff` — claimable applied-change preview gesture. */
export const EXPLORER_OPEN_DIFF_EVENT = 'sdkwork:explorer:open-diff'

/** `sdkwork:explorer:open-url` — claimable conversation-link open gesture. */
export const EXPLORER_OPEN_URL_EVENT = 'sdkwork:explorer:open-url'

/**
 * Dispatch one open-file gesture.
 * @returns true when a listener claimed the gesture (default suppressed).
 */
export function dispatchExplorerOpenFile(detail: ExplorerOpenFileDetail): boolean {
  return !document.dispatchEvent(new CustomEvent<ExplorerOpenFileDetail>(
    EXPLORER_OPEN_FILE_EVENT,
    { cancelable: true, detail },
  ))
}

/**
 * Dispatch one open-url gesture.
 * @returns true when a listener claimed the gesture (default suppressed).
 */
export function dispatchExplorerOpenUrl(detail: ExplorerOpenUrlDetail): boolean {
  return !document.dispatchEvent(new CustomEvent<ExplorerOpenUrlDetail>(
    EXPLORER_OPEN_URL_EVENT,
    { cancelable: true, detail },
  ))
}

/**
 * Whether one open-diff detail's hunks are well-formed applied changes — the
 * structural narrowing the listener runs before claiming, since the bus is a
 * cross-bundle channel whose payloads arrive outside TypeScript's reach.
 * @param hunks - the detail's `hunks` field.
 * @returns whether the hunks can feed the diff preview.
 */
export function isDiffHunks(hunks: unknown): hunks is readonly ExplorerDiffHunk[] {
  if (!Array.isArray(hunks) || hunks.length === 0) return false
  return hunks.every((hunk: unknown) => {
    if (typeof hunk !== 'object' || hunk === null) return false
    const { path, oldText, newText } = hunk as Record<string, unknown>
    return typeof path === 'string'
      && (oldText === null || typeof oldText === 'string')
      && typeof newText === 'string'
  })
}
