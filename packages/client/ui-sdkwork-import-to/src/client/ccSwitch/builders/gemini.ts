/**
 * Gemini CLI and Antigravity.
 *
 * Gemini CLI reads the gateway from `~/.gemini/.env` and the auth mode plus
 * default model from `~/.gemini/settings.json`. Antigravity (`agy`) cannot be
 * redirected globally: it reads the key and endpoint from the process
 * environment only, so its import is a private `--gemini_dir` profile plus the
 * command that starts the CLI in that directory.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { dotenvLine, jsonText } from '../format.ts'
import { endpointOf, providerIdOf } from './common.ts'

/** Selected-auth value Gemini CLI uses for API-key providers. */
export const GEMINI_API_KEY_AUTH = 'gemini-api-key'

/**
 * Gemini CLI live files (`.env` and `settings.json`).
 * @param input - import input.
 * @returns both files.
 */
export function geminiFiles(input: ImportInput): readonly ImportFile[] {
  const endpoint = endpointOf(input)
  const geminiDir = joinPath(input.platform.home, ['.gemini'], input.platform.platform)
  const envLines = [
    dotenvLine('GOOGLE_GEMINI_BASE_URL', endpoint),
    dotenvLine('GEMINI_API_KEY', input.apiKey),
  ]
  if (input.model !== undefined && input.model !== '') envLines.push(dotenvLine('GEMINI_MODEL', input.model))
  const settings: Record<string, unknown> = {
    security: { auth: { selectedType: GEMINI_API_KEY_AUTH } },
  }
  if (input.model !== undefined && input.model !== '') settings.model = { name: input.model }
  return [
    {
      path: joinPath(geminiDir, ['.env'], input.platform.platform),
      format: 'dotenv',
      write: 'merge-dotenv',
      content: `${envLines.join('\n')}\n`,
      fragment: envLines.join('\n'),
      managedKeys: ['GOOGLE_GEMINI_BASE_URL', 'GEMINI_API_KEY', 'GEMINI_MODEL'],
      note: '其余行和注释保留；托管的三行会被替换。',
    },
    {
      path: joinPath(geminiDir, ['settings.json'], input.platform.platform),
      format: 'json',
      write: 'merge-json',
      content: jsonText(settings),
      fragment: jsonText(settings),
      managedKeys: ['security.auth.selectedType', 'model.name'],
      note: '只改认证方式与默认模型，MCP 等其他键不动。',
    },
  ]
}

/**
 * Antigravity's private profile directory.
 * @param input - import input.
 * @returns the `--gemini_dir` value.
 */
export function agyProfileDir(input: ImportInput): string {
  return joinPath(
    input.platform.home,
    ['.birdcoder', 'agy', providerIdOf(input)],
    input.platform.platform,
  )
}

/**
 * Antigravity's private profile plus its launch command.
 * @param input - import input.
 * @returns the private settings file and the two shell commands.
 */
export function agyFiles(input: ImportInput): readonly ImportFile[] {
  const profileDir = agyProfileDir(input)
  const settings: Record<string, unknown> = { modelProvider: 'gemini' }
  if (input.model !== undefined && input.model !== '') settings.model = input.model
  return [{
    path: joinPath(profileDir, ['antigravity-cli', 'settings.json'], input.platform.platform),
    format: 'json',
    write: 'replace',
    content: jsonText(settings),
    managedKeys: ['modelProvider', 'model'],
    role: 'support',
    note: `私有会话目录；把 ${joinPath(profileDir, ['antigravity-cli', 'config'], input.platform.platform)} 链到 ~/.gemini/config 可共享 MCP 与 Skills。`,
  }]
}
