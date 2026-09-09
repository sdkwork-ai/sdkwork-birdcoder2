/**
 * Unified-patch reconstruction: turn one `.diff`/`.patch` file's text back
 * into the pre-image and post-image it edits, so the Monaco diff editor —
 * the same kernel VSCode's git diff renders with — can show the change with
 * word-level highlighting, collapsible gaps, and a real minimap instead of
 * a colored text listing.
 *
 * The hunk headers carry the truth: `@@ -a,b +c,d @@` places each hunk at
 * line `a` of the old file and line `c` of the new one, and their counts
 * bound the hunk body — the state machine below tracks both, so a body row
 * whose content starts with `--`/`++`/`diff `/`index ` is classified by
 * position (deletion/addition) instead of colliding with the file headers.
 * Gaps between hunks are unknown content, marked with an ellipsis sentinel
 * line on both sides (the same convention every diff renderer uses); the
 * declared counts and positions decide where a gap actually exists, so
 * adjacent hunks stay contiguous. A patch touching more than one file or
 * carrying no parseable hunks is not reconstructable this way —
 * {@link canReconstruct} says so up front and the view falls back to the
 * decorated text listing.
 */

/** The reconstruction result the diff editor consumes. */
export interface PatchReconstruction {
  /** The pre-image text (the `-` side, gaps elided). */
  oldText: string
  /** The post-image text (the `+` side, gaps elided). */
  newText: string
  /** The target path from the `+++ b/…` header (for the language hint). */
  targetPath: string
  /** Added-line count the body reports. */
  added: number
  /** Deleted-line count the body reports. */
  removed: number
}

/** The sentinel line standing for elided unknown content on both sides. */
export const ELLIPSIS = '⋯'

/** One hunk header: start and (optional) count per side. */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/** A hunk side's row count: the declared count, or 1 when omitted (`@@ -5 +5 @@`). */
function hunkRowCount(value: string | undefined): number {
  return value === undefined ? 1 : Number(value)
}

/**
 * Whether one patch file's text can feed the diff editor: exactly one file
 * touched and at least one parseable hunk. Plain (non-git) multi-file
 * patches repeat the `---`/`+++` headers without any `diff --git` row, so
 * the header counts — not just the git markers — decide.
 * @param content - the whole patch text.
 * @returns whether {@link reconstructPatch} can run on it.
 */
export function canReconstruct(content: string): boolean {
  const lines = content.split('\n')
  if (lines.filter(line => line.startsWith('diff --git ')).length > 1) return false
  if (lines.filter(line => line.startsWith('+++ ')).length > 1) return false
  return /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(content)
}

/**
 * Reconstruct the two sides of one single-file unified patch.
 * @param content - the whole patch text (a single-file patch, see {@link canReconstruct}).
 * @returns the pre-image, post-image, target path, and change counts.
 */
export function reconstructPatch(content: string): PatchReconstruction {
  const all = content.split('\n')
  const lines = all[all.length - 1] === '' ? all.slice(0, -1) : all
  const oldLines: string[] = []
  const newLines: string[] = []
  let oldPos = 0
  let newPos = 0
  let targetPath = ''
  let added = 0
  let removed = 0
  // The hunk body is prefix-governed: inside it, `-`/`+`/space are row
  // kinds and the header's counts bound how many rows of each side remain.
  // Outside a hunk, the header rows carry the file metadata.
  let inHunk = false
  let oldRemain = 0
  let newRemain = 0

  for (const line of lines) {
    if (inHunk) {
      if (line.startsWith('+')) {
        newLines.push(line.slice(1))
        newPos += 1
        added += 1
        newRemain -= 1
      } else if (line.startsWith('-')) {
        oldLines.push(line.slice(1))
        oldPos += 1
        removed += 1
        oldRemain -= 1
      } else if (line.startsWith('\\')) {
        // `\ No newline at end of file` — a marker, not a row.
      } else if (line.startsWith(' ') || line === '') {
        // Context: the space-prefixed row, or the bare empty line some
        // tools emit for an empty context row.
        const text = line.slice(1)
        oldLines.push(text)
        newLines.push(text)
        oldPos += 1
        newPos += 1
        oldRemain -= 1
        newRemain -= 1
      } else {
        // Malformed row: stop trusting this hunk's body.
        inHunk = false
        oldRemain = 0
        newRemain = 0
        continue
      }
      if (oldRemain <= 0 && newRemain <= 0) {
        inHunk = false
        oldRemain = 0
        newRemain = 0
      }
      continue
    }
    const hunk = HUNK_HEADER.exec(line)
    if (hunk !== null) {
      const oldStart = Number(hunk[1])
      const newStart = Number(hunk[3])
      // Unknown content stands between the rebuilt rows and this hunk's
      // declared start — either the gap after a previous hunk or (for a
      // patch that does not begin at line 1) the head of the file. One
      // sentinel pair marks it; the diff editor folds it. Adjacent hunks
      // (declared start == the rebuilt position) stay contiguous.
      if (oldPos + 1 < oldStart || newPos + 1 < newStart) {
        oldLines.push(ELLIPSIS)
        newLines.push(ELLIPSIS)
      }
      oldPos = oldStart - 1
      newPos = newStart - 1
      oldRemain = hunkRowCount(hunk[2])
      newRemain = hunkRowCount(hunk[4])
      inHunk = true
      continue
    }
    if (line.startsWith('+++ ')) {
      // `+++ b/src/app.ts` (git style) or `+++ src/app.ts` (plain).
      const raw = line.slice(4).trim().split('\t')[0] ?? ''
      targetPath = raw.replace(/^[ab]\//, '')
      continue
    }
    if (line.startsWith('--- ') || /^diff /i.test(line) || /^index /i.test(line)) continue
  }

  return { oldText: oldLines.join('\n'), newText: newLines.join('\n'), targetPath, added, removed }
}
