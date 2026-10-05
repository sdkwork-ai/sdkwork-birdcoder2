/**
 * Git-ignore matching for directory packaging (the publish-as-template source
 * packer). Implements the `.gitignore` language subset git itself documents:
 * comments, `!` negation (last matching rule in one file wins), trailing `/`
 * directory-only patterns, anchoring (a pattern containing a `/` anywhere but
 * the trailing position binds to the file's directory), `**` segments, `*`
 * `?` `[...]` globs that never cross `/`, and the precedence rule that a
 * deeper `.gitignore` overrides a shallower one inside its subtree.
 *
 * Deliberately NOT modeled: core.excludesfile / global ignores (a template
 * pack is repo-local), CRLF-only normalization beyond stripping `\r`, and
 * re-inclusion under an excluded directory (git prunes there — the packer
 * mirrors that by never consulting rule sets below a pruned directory).
 */

/** One parsed pattern inside one `.gitignore` file. */
interface GitIgnoreRule {
  /** Matches exclusions; false marks a `!` re-inclusion. */
  readonly negated: boolean
  /** Only matches directories (the pattern ended with `/`). */
  readonly directoryOnly: boolean
  /** Tested against the path relative to the rule set's base (not any suffix). */
  readonly anchored: boolean
  /** Fully-anchored pattern matcher over one path-relative-to-base. */
  readonly matcher: (relativePath: string) => boolean
}

/** One parsed `.gitignore` file: its rules scoped to a directory prefix. */
export interface GitIgnoreRuleSet {
  /** Directory the file lives in, `''` for the pack root, else `'apps/'`-style (trailing slash). */
  readonly base: string
  readonly rules: readonly GitIgnoreRule[]
}

/**
 * Parse one `.gitignore` body into a rule set.
 * @param text - raw file text (any line endings).
 * @param base - the file's directory prefix, `''` for the root, else with a trailing slash.
 * @returns the rule set; blank files parse to an empty rule set.
 */
export function parseGitIgnore(text: string, base: string): GitIgnoreRuleSet {
  const rules: GitIgnoreRule[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line.trim() === '' || line.startsWith('#')) continue
    const negated = line.startsWith('!')
    let pattern = negated ? line.slice(1) : line
    // Trailing spaces are insignificant unless escaped; git trims them.
    pattern = pattern.replace(/(?<!\\)\s+$/u, '')
    if (pattern === '') continue
    const directoryOnly = pattern.endsWith('/')
    if (directoryOnly) pattern = pattern.slice(0, -1)
    if (pattern === '') continue
    const anchored = pattern.includes('/')
    const body = anchored ? pattern.replace(/^\//u, '') : pattern
    rules.push({
      negated,
      directoryOnly,
      anchored,
      matcher: buildSegmentMatcher(body, anchored),
    })
  }
  return { base, rules }
}

/**
 * Decide one path against an ordered chain of rule sets (shallow first).
 * @param path - posix path relative to the pack root, no leading slash.
 * @param isDirectory - whether the candidate is a directory.
 * @param ruleSets - sets whose `base` is a prefix of `path`, shallowest first.
 * @returns true when the path is ignored. Within one set the last matching
 *   rule wins; a deeper set that decides anything overrides shallower sets.
 */
export function isIgnoredByChain(
  rawPath: string,
  isDirectory: boolean,
  ruleSets: readonly GitIgnoreRuleSet[],
): boolean {
  // Directory candidates arrive with a trailing slash from the packer's
  // prefix walk; matchers are built over bare relative paths.
  const path = isDirectory ? rawPath.replace(/\/$/u, '') : rawPath
  let ignored = false
  for (const set of ruleSets) {
    const remainder = path.startsWith(set.base) ? path.slice(set.base.length) : undefined
    if (remainder === undefined || remainder === '') continue
    for (const rule of set.rules) {
      if (rule.directoryOnly && !isDirectory) continue
      if (!rule.matcher(remainder)) continue
      // The last matching rule in this set wins; a deeper set that decides
      // replaces the shallower decision, and one that decides nothing leaves
      // the shallower decision standing.
      ignored = !rule.negated
    }
  }
  return ignored
}

/** Build a matcher over one pattern body (leading `/` and trailing `/` stripped). */
function buildSegmentMatcher(body: string, anchored: boolean): (relativePath: string) => boolean {
  const source = globSegmentSource(body)
  if (anchored) {
    const anchored = new RegExp(`^${source}$`, 'u')
    return relativePath => anchored.test(relativePath)
  }
  // Unanchored: matches the basename at any depth.
  const anywhere = new RegExp(`(?:^|/)${source}$`, 'u')
  return relativePath => anywhere.test(relativePath)
}

/** Translate one glob pattern body into a regex source over a posix path. */
function globSegmentSource(body: string): string {
  const segments = body.split('/')
  let out = ''
  let pendingSlash = false
  for (const segment of segments) {
    if (segment === '**') {
      // `**` spans zero or more whole segments. Leading: it carries the
      // trailing slash itself, so the next segment joins bare. Elsewhere: it
      // absorbs the slash the previous segment left pending, and the next
      // segment needs its own slash again.
      if (out === '') {
        out += '(?:[^/]+/)*'
        pendingSlash = false
      } else {
        out += '(?:/[^/]+)*'
        pendingSlash = true
      }
      continue
    }
    out += (pendingSlash ? '/' : '') + globAtomSource(segment)
    pendingSlash = true
  }
  return out
}

/** Translate one non-`**` glob segment into a regex source over one path segment. */
function globAtomSource(segment: string): string {
  let out = ''
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index]
    if (char === '*') {
      out += '[^/]*'
      continue
    }
    if (char === '?') {
      out += '[^/]'
      continue
    }
    if (char === '[') {
      const translated = translateCharClass(segment, index)
      if (translated !== undefined) {
        out += translated.source
        index = translated.nextIndex
        continue
      }
    }
    if (char === '\\' && index + 1 < segment.length) {
      out += regexEscape(segment[index + 1])
      index += 1
      continue
    }
    out += regexEscape(char)
  }
  return out
}

/**
 * Translate a `[...]` class starting at `start`.
 * @returns the class source plus the index of its closing `]`, or undefined
 *   when the bracket never closes (git treats an unclosed `[` literally).
 */
function translateCharClass(
  segment: string,
  start: number,
): { source: string; nextIndex: number } | undefined {
  let index = start + 1
  let body = ''
  if (segment[index] === '!' || segment[index] === '^') {
    body += '^'
    index += 1
  }
  if (segment[index] === ']') {
    body += '\\]'
    index += 1
  }
  while (index < segment.length && segment[index] !== ']') {
    body += regexEscape(segment[index])
    index += 1
  }
  if (segment[index] !== ']') return undefined
  return { source: `[${body}]`, nextIndex: index }
}

function regexEscape(char: string): string {
  return /[.*+?^${}()|[\]\\]/u.test(char) ? `\\${char}` : char
}
