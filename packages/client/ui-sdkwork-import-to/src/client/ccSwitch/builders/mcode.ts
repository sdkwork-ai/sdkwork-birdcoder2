/**
 * MiniMax Code.
 *
 * `~/.minimax/config.yaml` keeps `custom_provider.<id>` nodes shared by every
 * CC Switch-style importer; `defaultModel` is left to the user (MiniMax Code's
 * own switcher owns it).
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { yamlText, type YamlValue } from '../format.ts'
import { endpointOf, modelOf, providerIdOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/**
 * MiniMax Code's provider node.
 * @param input - import input.
 * @returns one merge-yaml file.
 */
export function mcodeFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const node: Record<string, YamlValue> = {
    name: input.name,
    kind: 'custom',
    enabled: true,
    api: protocolValue('pi-ai', input.apiFormat),
    options: { baseURL: endpointOf(input), apiKey: input.apiKey },
    models: { [model]: { name: model } },
  }
  return [{
    path: joinPath(input.platform.home, ['.minimax', 'config.yaml'], input.platform.platform),
    format: 'yaml',
    write: 'merge-yaml',
    content: yamlText({ custom_provider: { [id]: node } }),
    fragment: yamlText({ custom_provider: { [id]: node } }),
    managedKeys: [`custom_provider.${id}`],
    note: 'defaultModel 不动：在 MiniMax Code 里选择这个模型一次。',
  }]
}
