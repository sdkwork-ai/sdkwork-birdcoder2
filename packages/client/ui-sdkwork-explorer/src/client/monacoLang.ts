/** Monaco language id for one workspace path (Monaco ids differ from Shiki's). */

/** Path → Monaco language id. Monaco's bundled basic-languages cover these; `diff` and `json` are registered by monacoSetup. */
const MONACO_LANG_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json', '.jsonc': 'json',
  '.md': 'markdown', '.markdown': 'markdown', '.mdx': 'mdx',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html', '.htm': 'html', '.vue': 'html', '.svelte': 'html',
  '.xml': 'xml', '.svg': 'xml', '.xsl': 'xml',
  '.yml': 'yaml', '.yaml': 'yaml',
  '.toml': 'ini', '.ini': 'ini', '.cfg': 'ini', '.conf': 'ini', '.properties': 'ini',
  '.py': 'python', '.pyi': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.kts': 'kotlin', '.swift': 'swift',
  '.c': 'cpp', '.h': 'cpp', '.cpp': 'cpp', '.cc': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
  '.cs': 'csharp', '.php': 'php', '.lua': 'lua', '.sql': 'sql', '.pl': 'perl',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.fish': 'shell',
  '.ps1': 'powershell', '.psm1': 'powershell',
  '.bat': 'bat', '.cmd': 'bat',
  '.graphql': 'graphql', '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.proto': 'protobuf', '.tf': 'hcl', '.hcl': 'hcl',
  '.diff': 'diff', '.patch': 'diff',
}

/**
 * Monaco language id for one path, or `plaintext`.
 * @param path - the file's absolute path.
 * @returns the Monaco language id.
 */
export function monacoLangFromPath(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? ''
  if (base.toLowerCase() === 'dockerfile') return 'dockerfile'
  if (base.toLowerCase() === 'makefile') return 'shell'
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return 'plaintext'
  return MONACO_LANG_BY_EXTENSION[`.${base.slice(dot + 1).toLowerCase()}`] ?? 'plaintext'
}

/**
 * The Shiki language hint the lightweight fallback (ReadBlock) can render,
 * narrowed from the Monaco id to the ids the primitives' grammar allowlist
 * accepts (undefined = plain monospace there).
 * @param monacoLang - the Monaco language id from {@link monacoLangFromPath}.
 * @returns a Shiki-allowlist language id, or undefined.
 */
export function fallbackShikiLang(monacoLang: string): string | undefined {
  const KNOWN = new Set([
    'typescript', 'javascript', 'json', 'markdown', 'mdx', 'css', 'scss', 'less',
    'html', 'xml', 'yaml', 'ini', 'python', 'ruby', 'go', 'rust', 'java', 'kotlin',
    'swift', 'cpp', 'csharp', 'php', 'lua', 'sql', 'shellscript', 'powershell',
    'dockerfile', 'graphql', 'diff', 'perl',
  ])
  const alias: Record<string, string> = { shell: 'shellscript' }
  const candidate = alias[monacoLang] ?? monacoLang
  return KNOWN.has(candidate) ? candidate : undefined
}
