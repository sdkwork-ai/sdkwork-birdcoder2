/**
 * The `apps/README.md` directory index (DOCUMENTATION_SPEC §3.3,
 * SDKWORK_WORKSPACE_SPEC §4): the repository-level table that names every
 * application root under `apps/`, its surface role, runnable flag, purpose,
 * and entry path.
 *
 * The template flow reads this index to learn which `apps/*` children are
 * independent applications (`role !== 'common'`) and updates it after a
 * template installs a new application root, so a downloaded scaffold joins
 * the repository exactly the way a hand-authored app does.
 *
 * Parsing is deliberately table-local: the file keeps free prose and section
 * headings, and every line outside the directory table passes through
 * untouched.
 */

/** One row of the directory index table. */
export interface AppsIndexRow {
  /** `apps/` child directory name. */
  readonly directory: string
  /** Surface role, for example `app`, `pc`, `h5`, `common`. */
  readonly role: string
  /** `yes` / `no` runnable flag. */
  readonly runnable: string
  /** Human-readable purpose. */
  readonly purpose: string
  /** Entry cell, usually a markdown link or a path. */
  readonly entry: string
}

/** Column meanings of the canonical header, in order. */
const HEADER_CELLS = ['directory', 'surface role', 'runnable', 'purpose', 'entry'] as const

/** One parsed table: the line range it occupies and its rows. */
interface IndexTable {
  /** Zero-based index of the header line. */
  readonly headerIndex: number
  /** Zero-based index of the first data row. */
  readonly firstRowIndex: number
  /** Exclusive end index of the table body. */
  readonly endIndex: number
  readonly rows: readonly AppsIndexRow[]
}

/**
 * Parse the directory index into a directory → row map.
 * @param text - raw `apps/README.md` (any line endings).
 * @returns the rows; an absent or malformed table reads as an empty map.
 */
export function parseAppsIndex(text: string): ReadonlyMap<string, AppsIndexRow> {
  const table = findIndexTable(text)
  if (table === undefined) return new Map()
  return new Map(table.rows.map(row => [row.directory, row]))
}

/**
 * Insert or replace one directory row, preserving every line outside the
 * table.
 * @param text - raw `apps/README.md`.
 * @param row - the row to write.
 * @returns the updated markdown. Without a recognizable directory table the
 *   input is returned unchanged (the caller reports the skipped index update).
 */
export function upsertAppsIndexRow(text: string, row: AppsIndexRow): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/u)
  const table = findIndexTable(text)
  if (table === undefined) return text
  const formatted = formatAppsIndexRow(row, newline)
  const existing = table.rows.findIndex(entry => entry.directory === row.directory)
  if (existing >= 0) {
    const lineIndex = table.firstRowIndex + existing
    lines[lineIndex] = formatted
    return lines.join(newline)
  }
  lines.splice(table.endIndex, 0, formatted)
  return lines.join(newline)
}

/**
 * Format one row as a markdown table line.
 * @param row - the row values.
 * @param newline - the document's line ending (defaults to `\n`).
 * @returns the table line.
 */
export function formatAppsIndexRow(row: AppsIndexRow, newline = '\n'): string {
  const cells = [row.directory, row.role, row.runnable, row.purpose, row.entry]
    .map(cell => cell.replaceAll('|', '\\|').replaceAll(/\r?\n/gu, ' ').trim())
  return `| ${cells.join(' | ')} |${newline}`
}

/** Locate the canonical directory table in one document. */
function findIndexTable(text: string): IndexTable | undefined {
  const lines = text.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const header = parseTableCells(lines[index] ?? '')
    if (header === undefined) continue
    const normalized = header.map(cell => cell.toLowerCase())
    if (!HEADER_CELLS.every((cell, position) => normalized[position] === cell)) continue
    const separator = parseTableCells(lines[index + 1] ?? '')
    if (separator === undefined || !separator.every(cell => /^:?-{3,}:?$/u.test(cell))) continue
    const rows: AppsIndexRow[] = []
    let end = index + 2
    while (end < lines.length) {
      const cells = parseTableCells(lines[end] ?? '')
      if (cells === undefined) break
      const [directory, role, runnable, purpose, entry] = cells as (string | undefined)[]
      if (directory !== undefined && directory !== '') {
        rows.push({
          directory,
          role: role ?? '',
          runnable: runnable ?? '',
          purpose: purpose ?? '',
          entry: entry ?? '',
        })
      }
      end += 1
    }
    return { headerIndex: index, firstRowIndex: index + 2, endIndex: end, rows }
  }
  return undefined
}

/** Split one markdown table line into trimmed cells (undefined when not a row). */
function parseTableCells(line: string): string[] | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) return undefined
  const cells: string[] = []
  let current = ''
  // A backslash escapes a pipe so a purpose cell can contain one.
  for (let index = 1; index < trimmed.length - 1; index += 1) {
    const char = trimmed[index]
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}
