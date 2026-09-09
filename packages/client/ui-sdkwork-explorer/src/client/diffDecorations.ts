/** Unified-diff line classification for the decorated text-listing fallback. */

/** One whole-line change decoration parsed from a unified-diff file. */
export interface DiffDecoration {
  /** 1-based line number. */
  line: number
  /** The line's classification (drives the wash class). */
  kind: 'add' | 'del' | 'hunk' | 'meta'
}

/** The change counts a diff header reports. */
export interface DiffStats {
  decorations: DiffDecoration[]
  added: number
  removed: number
}

/**
 * Parse a unified-diff body into whole-line decoration rows — the change
 * washes the fallback viewer wears (add green, delete red, hunk and file
 * headers tinted) — together with the +/- line counts.
 * @param content - the whole diff text.
 * @returns the decorations and the change counts.
 */
export function diffDecorations(content: string): DiffStats {
  const all = content.split('\n')
  const lines = all[all.length - 1] === '' ? all.slice(0, -1) : all
  const decorations: DiffDecoration[] = []
  let added = 0
  let removed = 0
  for (const [index, line] of lines.entries()) {
    let kind: DiffDecoration['kind'] | undefined
    if (line.startsWith('--- ') || line.startsWith('+++ ') || /^diff /i.test(line) || /^index /i.test(line)) kind = 'meta'
    else if (line.startsWith('@@')) kind = 'hunk'
    else if (line.startsWith('+')) {
      kind = 'add'
      added += 1
    } else if (line.startsWith('-')) {
      kind = 'del'
      removed += 1
    }
    if (kind !== undefined) decorations.push({ line: index + 1, kind })
  }
  return { decorations, added, removed }
}
