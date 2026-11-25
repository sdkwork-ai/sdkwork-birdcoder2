/**
 * Grok Build.
 *
 * `~/.grok/config.toml` holds a `[models]` table with the default model and one
 * `[model."<id>"]` table per custom model; the key lives in that table.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { tomlString } from '../format.ts'
import { endpointOf, modelOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/** Model Grok Build falls back to when the import leaves it empty (CC Switch's default). */
export const GROK_DEFAULT_MODEL = 'grok-4.7'

/** Context window CC Switch writes for an imported Grok model. */
export const GROK_DEFAULT_CONTEXT_WINDOW = 500_000

/**
 * Grok Build's live config.
 * @param input - import input.
 * @returns one merge-toml file.
 */
export function grokbuildFiles(input: ImportInput): readonly ImportFile[] {
  const model = modelOf(input, GROK_DEFAULT_MODEL).trim()
  const endpoint = endpointOf(input)
  const name = input.name.trim() === '' ? 'custom' : input.name.trim()
  const backend = protocolValue('grok-backend', input.apiFormat)
  const body = [
    '[models]',
    `default = ${tomlString(model)}`,
    '',
    `[model.${tomlString(model)}]`,
    `model = ${tomlString(model)}`,
    `base_url = ${tomlString(endpoint)}`,
    `name = ${tomlString(name)}`,
    `api_key = ${tomlString(input.apiKey)}`,
    `api_backend = ${tomlString(backend)}`,
    `context_window = ${GROK_DEFAULT_CONTEXT_WINDOW}`,
    '',
  ].join('\n')
  return [{
    path: joinPath(input.platform.home, ['.grok', 'config.toml'], input.platform.platform),
    format: 'toml',
    write: 'merge-toml',
    content: body,
    fragment: body.split('\n').slice(3).join('\n'),
    managedKeys: ['models.default', `model.${model}`],
    note: '同一文件里其他模型表保留；导入的模型会成为默认模型。',
  }]
}
