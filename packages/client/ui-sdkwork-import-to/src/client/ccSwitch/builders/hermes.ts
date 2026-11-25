/**
 * Hermes.
 *
 * `config.yaml` keeps a `custom_providers:` sequence upserted by `name`, plus
 * the top-level `model:` mapping that selects the active provider and model.
 * Windows reads `%LOCALAPPDATA%\hermes\config.yaml`; macOS and Linux read
 * `~/.hermes/config.yaml`.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { yamlText, type YamlValue } from '../format.ts'
import { endpointOf, modelOf, providerIdOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/**
 * Root directory Hermes reads on the import's platform.
 * @param input - import input.
 * @returns `%LOCALAPPDATA%\hermes` on Windows, `~/.hermes` elsewhere.
 */
export function hermesDir(input: ImportInput): string {
  return input.platform.platform === 'win32'
    ? joinPath(input.platform.localAppData, ['hermes'], input.platform.platform)
    : joinPath(input.platform.home, ['.hermes'], input.platform.platform)
}

/**
 * Hermes' live config.
 * @param input - import input.
 * @returns one merge-yaml file.
 */
export function hermesFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const entry: Record<string, YamlValue> = {
    name: id,
    base_url: endpointOf(input),
    api_key: input.apiKey,
    api_mode: protocolValue('hermes-mode', input.apiFormat),
  }
  const document: Record<string, YamlValue> = {}
  if (model !== '') {
    entry.models = { [model]: {} }
    entry.model = model
    document.model = { default: model, provider: id }
  }
  document.custom_providers = [entry]
  return [{
    path: joinPath(hermesDir(input), ['config.yaml'], input.platform.platform),
    format: 'yaml',
    write: 'merge-yaml',
    content: yamlText(document),
    fragment: yamlText(document),
    managedKeys: [`custom_providers[name=${id}]`, 'model.default', 'model.provider'],
    note: 'models 写成以模型 id 为键的映射，model 指向本家。',
  }]
}
