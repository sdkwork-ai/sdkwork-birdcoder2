/**
 * Install command for one plan.
 *
 * The command never overwrites an existing live file: a `replace` file is
 * backed up first, a first-time file is created, and a merge file that already
 * exists receives its fragment as a `<path>.birdcoder-import` sidecar so the
 * user (or a later merge step) can apply the managed keys deliberately.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { powershellPath, posixPath } from '../platform.ts'
import type { ImportFile, InstallScript, TargetPlatform } from '../types.ts'

/** Shell action one file maps to. */
type FileAction = 'replace' | 'create' | 'fragment'

/**
 * Action for one file entry.
 * @param file - planned file.
 * @returns `replace` for plugin-owned documents, `create`/`fragment` otherwise.
 */
function actionFor(file: ImportFile): FileAction {
  return file.write === 'replace' ? 'replace' : 'create'
}

/**
 * PowerShell program that applies the plan.
 * @param label - target product name, used in the header comment.
 * @param files - planned files.
 * @returns the script text.
 */
function powershellScript(label: string, files: readonly ImportFile[]): string {
  const lines = [
    `# BirdCoder import -> ${label}`,
    '# Runs in PowerShell 7 (pwsh). Existing live files are never overwritten;',
    '# merge files keep their fragment in a .birdcoder-import sidecar.',
    "$ErrorActionPreference = 'Stop'",
    '',
    'function Write-BirdCoderFile {',
    '  param([string]$Path, [string]$Action, [string]$Payload)',
    '  $dir = Split-Path -Parent $Path',
    '  if ($dir -and -not (Test-Path -LiteralPath $dir)) {',
    '    New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    '  }',
    "  if ($Action -eq 'replace') {",
    '    if (Test-Path -LiteralPath $Path) {',
    '      Copy-Item -LiteralPath $Path -Destination "$Path.birdcoder.bak" -Force',
    '    }',
    '    Set-Content -LiteralPath $Path -Value $Payload -NoNewline -Encoding utf8',
    '    Write-Host "wrote $Path"',
    '    return',
    '  }',
    "  if ($Action -eq 'create') {",
    '    if (Test-Path -LiteralPath $Path) { Write-Host "kept $Path (exists)"; return }',
    '    Set-Content -LiteralPath $Path -Value $Payload -NoNewline -Encoding utf8',
    '    Write-Host "created $Path"',
    '    return',
    '  }',
    '  if (-not (Test-Path -LiteralPath $Path)) { return }',
    '  Set-Content -LiteralPath "$Path.birdcoder-import" -Value $Payload -NoNewline -Encoding utf8',
    '  Write-Host "kept $Path (exists); fragment at $Path.birdcoder-import"',
    '}',
    '',
  ]
  for (const file of files) {
    const path = powershellPath(file.path)
    lines.push(`Write-BirdCoderFile -Path ${path} -Action '${actionFor(file)}' -Payload @'`)
    lines.push(file.content.replace(/\n$/, ''))
    lines.push("'@")
    if (file.fragment !== undefined && file.fragment !== file.content) {
      lines.push(`Write-BirdCoderFile -Path ${path} -Action 'fragment' -Payload @'`)
      lines.push(file.fragment.replace(/\n$/, ''))
      lines.push("'@")
    }
  }
  return `${lines.join('\n')}\n`
}

/**
 * POSIX program that applies the plan.
 * @param label - target product name, used in the header comment.
 * @param files - planned files.
 * @returns the script text.
 */
function posixScript(label: string, files: readonly ImportFile[]): string {
  const lines = [
    `# BirdCoder import -> ${label}`,
    '# Existing live files are never overwritten;',
    '# merge files keep their fragment in a .birdcoder-import sidecar.',
    'set -eu',
    '',
    'write_birdcoder_file() {',
    '  path=$1',
    '  action=$2',
    '  if [ "$action" = "create" ] && [ -f "$path" ]; then',
    '    echo "kept $path (exists)"',
    '    return 0',
    '  fi',
    '  if [ "$action" = "fragment" ] && [ ! -f "$path" ]; then return 0; fi',
    '  if [ "$action" = "replace" ] && [ -f "$path" ]; then cp "$path" "$path.birdcoder.bak"; fi',
    '  target=$path',
    '  if [ "$action" = "fragment" ]; then target="$path.birdcoder-import"; fi',
    '  mkdir -p "$(dirname "$target")"',
    '  cat > "$target"',
    '  echo "wrote $target"',
    '}',
    '',
  ]
  for (const file of files) {
    const path = posixPath(file.path)
    lines.push(`write_birdcoder_file ${path} ${actionFor(file)} <<'BIRDCODER_EOF'`)
    lines.push(file.content.replace(/\n$/, ''))
    lines.push('BIRDCODER_EOF')
    if (file.fragment !== undefined && file.fragment !== file.content) {
      lines.push(`write_birdcoder_file ${path} fragment <<'BIRDCODER_EOF'`)
      lines.push(file.fragment.replace(/\n$/, ''))
      lines.push('BIRDCODER_EOF')
    }
  }
  return `${lines.join('\n')}\n`
}

/**
 * Install command for a plan.
 * @param label - target product name.
 * @param platform - plan platform.
 * @param files - planned files.
 * @returns the script and its shell.
 */
export function buildInstallScript(
  label: string,
  platform: TargetPlatform,
  files: readonly ImportFile[],
): InstallScript {
  return platform === 'win32'
    ? { kind: 'powershell', text: powershellScript(label, files) }
    : { kind: 'posix', text: posixScript(label, files) }
}
