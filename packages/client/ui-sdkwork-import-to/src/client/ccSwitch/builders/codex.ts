/**
 * Codex CLI.
 *
 * `config.toml` selects the `custom` model provider and carries the endpoint
 * and wire API; `auth.json` carries the key under `OPENAI_API_KEY` (the file
 * Codex reads because `requires_openai_auth = true`).
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { jsonText, tomlString } from '../format.ts'
import { endpointOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/** Model Codex uses when the import leaves the field empty (CC Switch's default). */
export const CODEX_DEFAULT_MODEL = 'gpt-5-codex'

/**
 * Codex live files.
 * @param input - import input.
 * @returns `config.toml` and `auth.json`.
 */
export function codexFiles(input: ImportInput): readonly ImportFile[] {
  const endpoint = endpointOf(input)
  const model = input.model === undefined || input.model === '' ? CODEX_DEFAULT_MODEL : input.model
  const wire = protocolValue('codex-wire', input.apiFormat)
  const config = [
    'model_provider = "custom"',
    `model = ${tomlString(model)}`,
    'model_reasoning_effort = "high"',
    '',
    '[model_providers.custom]',
    `name = ${tomlString(input.name)}`,
    `base_url = ${tomlString(endpoint)}`,
    `wire_api = ${tomlString(wire)}`,
    'requires_openai_auth = true',
    '',
  ].join('\n')
  const home = joinPath(input.platform.home, ['.codex'], input.platform.platform)
  return [
    {
      path: joinPath(home, ['config.toml'], input.platform.platform),
      format: 'toml',
      write: 'merge-toml',
      content: config,
      fragment: [
        `model = ${tomlString(model)}`,
        'model_provider = "custom"',
        'model_reasoning_effort = "high"',
        '',
        '[model_providers.custom]',
        `name = ${tomlString(input.name)}`,
        `base_url = ${tomlString(endpoint)}`,
        `wire_api = ${tomlString(wire)}`,
        'requires_openai_auth = true',
      ].join('\n'),
      managedKeys: ['model', 'model_provider', 'model_reasoning_effort', 'model_providers.custom'],
      note: 'CODEX_HOME 环境变量可改写 ~/.codex 的位置。',
    },
    {
      path: joinPath(home, ['auth.json'], input.platform.platform),
      format: 'json',
      write: 'merge-json',
      content: jsonText({ OPENAI_API_KEY: input.apiKey }),
      fragment: jsonText({ OPENAI_API_KEY: input.apiKey }),
      managedKeys: ['OPENAI_API_KEY'],
      note: 'Codex 在 requires_openai_auth 下从这里取 Key，不要提交到版本库。',
    },
  ]
}
