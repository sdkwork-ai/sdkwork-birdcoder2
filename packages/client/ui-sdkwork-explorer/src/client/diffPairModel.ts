/**
 * Applied-hunk pair reconstruction: turn the write/edit tool call's hunks —
 * the same `{ path, oldText, newText }` entries the chat row's diff card
 * renders — into the single pre-image/post-image pair the Monaco diff editor
 * consumes, so clicking a changed file opens the same kernel VSCode's git
 * diff renders with.
 *
 * The hunks carry no line positions, so the pair is the hunks' own lines in
 * order; a sentinel line stands between consecutive hunks on both sides, the
 * same elided-gap convention every diff renderer uses (see patchReconstruct).
 * The diff editor aligns the sentinels, so each hunk's change highlights on
 * its own rows exactly as the flattened chat card draws them.
 * @module
 */

import { ELLIPSIS } from './patchReconstruct.ts'
import type { ExplorerDiffHunk } from './bus.ts'

/** The reconstructed pair the diff editor's two models hold. */
export interface DiffPair {
  /** The pre-image text (the removed side, gaps elided). */
  oldText: string
  /** The post-image text (the added side, gaps elided). */
  newText: string
}

/**
 * Split one side's text into its content lines: a single trailing newline is
 * a line terminator rather than an extra empty line, and empty text is zero
 * lines — the same terminator rule DiffBlock applies, so the editor pair and
 * the chat card count a hunk's rows identically.
 */
function contentLines(text: string): string[] {
  if (text === '') return []
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body.split('\n')
}

/**
 * Rebuild the two sides of one file's applied hunks.
 * @param hunks - the applied hunks in file order (non-empty; the gesture validates).
 * @returns the pre-image and post-image for the diff editor's models.
 */
export function diffPair(hunks: readonly ExplorerDiffHunk[]): DiffPair {
  const oldLines: string[] = []
  const newLines: string[] = []
  for (const [index, hunk] of hunks.entries()) {
    if (index > 0) {
      oldLines.push(ELLIPSIS)
      newLines.push(ELLIPSIS)
    }
    if (hunk.oldText !== null) oldLines.push(...contentLines(hunk.oldText))
    newLines.push(...contentLines(hunk.newText))
  }
  return { oldText: oldLines.join('\n'), newText: newLines.join('\n') }
}
