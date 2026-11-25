/**
 * Claude Code and Claude Desktop.
 *
 * Claude Code keeps one provider slot: `~/.claude/settings.json` `env` carries
 * `ANTHROPIC_BASE_URL`, the credential, and the optional model. Claude Desktop
 * takes a third-party gateway profile through its `Claude-3p` config library
 * and the two deployment-mode files.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { jsonText } from '../format.ts'
import { endpointOf } from './common.ts'

/**
 * Profile id registered in Claude Desktop's `configLibrary/_meta.json`.
 * A stable value of this plugin's own (CC Switch uses a different one), so the
 * two importers never overwrite each other's profile.
 */
export const CLAUDE_DESKTOP_PROFILE_ID = '00000000-0000-4000-8000-0000000b17c0'

/** Display name of the profile this plugin registers in Claude Desktop. */
export const CLAUDE_DESKTOP_PROFILE_NAME = 'BirdCoder'

/**
 * Claude Code's live `settings.json`.
 * @param input - import input.
 * @returns one merge-json file.
 */
export function claudeFiles(input: ImportInput): readonly ImportFile[] {
  const endpoint = endpointOf(input)
  const env: Record<string, string> = {
    ANTHROPIC_BASE_URL: endpoint,
    ANTHROPIC_AUTH_TOKEN: input.apiKey,
  }
  if (input.model !== undefined && input.model !== '') env.ANTHROPIC_MODEL = input.model
  return [{
    path: joinPath(input.platform.home, ['.claude', 'settings.json'], input.platform.platform),
    format: 'json',
    write: 'merge-json',
    content: jsonText({ env }),
    fragment: jsonText({ env }),
    managedKeys: Object.keys(env).map(key => `env.${key}`),
    note: 'CLAUDE_CONFIG_DIR 环境变量可改写 ~/.claude 的位置。',
  }]
}

/**
 * Claude Desktop's deployment files, gateway profile, and config-library index.
 * @param input - import input.
 * @returns the four files the Desktop needs.
 */
export function claudeDesktopFiles(input: ImportInput): readonly ImportFile[] {
  const endpoint = endpointOf(input)
  const deployment = { deploymentMode: '3p' }
  const profile: Record<string, unknown> = {
    coworkEgressAllowedHosts: ['*'],
    disableDeploymentModeChooser: true,
    inferenceGatewayApiKey: input.apiKey,
    inferenceGatewayAuthScheme: 'bearer',
    inferenceGatewayBaseUrl: endpoint,
    inferenceProvider: 'gateway',
  }
  if (input.model !== undefined && input.model !== '') profile.inferenceModels = [input.model]
  const meta = {
    entries: [{ id: CLAUDE_DESKTOP_PROFILE_ID, name: CLAUDE_DESKTOP_PROFILE_NAME }],
    appliedId: CLAUDE_DESKTOP_PROFILE_ID,
  }
  const separator = input.platform.platform
  const normal = joinPath(input.platform.localAppData, ['Claude', 'claude_desktop_config.json'], separator)
  const thirdParty = joinPath(input.platform.localAppData, ['Claude-3p'], separator)
  return [
    {
      path: normal,
      format: 'json',
      write: 'merge-json',
      content: jsonText(deployment),
      fragment: jsonText(deployment),
      managedKeys: ['deploymentMode'],
      note: '把 Claude Desktop 切到第三方部署模式。',
    },
    {
      path: joinPath(thirdParty, ['claude_desktop_config.json'], separator),
      format: 'json',
      write: 'merge-json',
      content: jsonText(deployment),
      fragment: jsonText(deployment),
      managedKeys: ['deploymentMode'],
      note: '3p 数据目录的部署模式文件，缺了 Desktop 不会进入第三方模式。',
    },
    {
      path: joinPath(thirdParty, ['configLibrary', `${CLAUDE_DESKTOP_PROFILE_ID}.json`], separator),
      format: 'json',
      write: 'replace',
      content: jsonText(profile),
      managedKeys: Object.keys(profile),
      note: '网关 profile 本体，Desktop 从 configLibrary 读取。',
    },
    {
      path: joinPath(thirdParty, ['configLibrary', '_meta.json'], separator),
      format: 'json',
      write: 'merge-json',
      content: jsonText(meta),
      fragment: jsonText({ entries: meta.entries, appliedId: meta.appliedId }),
      managedKeys: ['entries[].id', 'entries[].name', 'appliedId'],
      note: 'entries 是数组：按 id 原位更新本插件的条目，appliedId 指向它。',
    },
  ]
}
