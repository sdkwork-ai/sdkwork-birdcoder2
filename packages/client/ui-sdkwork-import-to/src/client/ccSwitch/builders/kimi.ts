/**
 * Kimi Code.
 *
 * `~/.kimi-code/config.toml` keeps `[providers.<id>]` plus one
 * `[models."<id>/<model>"]` table per model. Kimi rejects a model without a
 * positive `max_context_size`, so an imported model gets the 128K value CC
 * Switch uses for links.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { tomlKey, tomlString } from '../format.ts'
import { endpointOf, modelOf, providerIdOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/** Context window an imported Kimi model declares when the import carries none. */
export const KIMI_DEFAULT_CONTEXT_SIZE = 131_072

/**
 * Kimi Code's live config.
 * @param input - import input.
 * @returns one merge-toml file.
 */
export function kimiFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const modelKey = `${id}/${model}`
  const content = [
    `default_model = ${tomlString(modelKey)}`,
    '',
    `[providers.${tomlKey(id)}]`,
    `type = ${tomlString(protocolValue('kimi-type', input.apiFormat))}`,
    `base_url = ${tomlString(endpointOf(input))}`,
    `api_key = ${tomlString(input.apiKey)}`,
    '',
    `[models.${tomlString(modelKey)}]`,
    `provider = ${tomlString(id)}`,
    `model = ${tomlString(model)}`,
    `max_context_size = ${KIMI_DEFAULT_CONTEXT_SIZE}`,
    'capabilities = ["tool_use"]',
    '',
  ].join('\n')
  return [{
    path: joinPath(input.platform.home, ['.kimi-code', 'config.toml'], input.platform.platform),
    format: 'toml',
    write: 'merge-toml',
    content,
    fragment: content.split('\n').slice(2).join('\n'),
    managedKeys: [
      'default_model',
      `providers.${id}`,
      `models.${modelKey}`,
    ],
    note: 'default_model 指向新模型（与 CC Switch 的切换一致）；不想切换就删掉这一行。',
  }]
}
