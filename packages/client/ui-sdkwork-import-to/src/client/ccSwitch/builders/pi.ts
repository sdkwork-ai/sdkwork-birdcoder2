/**
 * Pi and Oh My Pi.
 *
 * Both keep a `providers.<id>` node in their models file with camelCase
 * `baseUrl` / `apiKey` / `api` fields; Pi adds a display `name`, Oh My Pi has
 * none. Pi's `settings.json` default provider is left alone, Oh My Pi's
 * `config.yml` is not touched.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { jsonText, yamlText } from '../format.ts'
import { endpointOf, modelOf, providerIdOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/**
 * Pi's live `models.json`.
 * @param input - import input.
 * @returns one merge-json file.
 */
export function piFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const node = {
    name: input.name,
    baseUrl: endpointOf(input),
    apiKey: input.apiKey,
    api: protocolValue('pi-ai', input.apiFormat),
    models: [{ id: model, name: model }],
  }
  return [{
    path: joinPath(input.platform.home, ['.pi', 'agent', 'models.json'], input.platform.platform),
    format: 'json',
    write: 'merge-json',
    content: jsonText({ providers: { [id]: node } }),
    fragment: jsonText({ providers: { [id]: node } }),
    managedKeys: [`providers.${id}`],
    note: 'settings.json 的 defaultProvider/defaultModel 不改：在 Pi 里自己选一次。',
  }]
}

/**
 * Oh My Pi's live `models.yml`.
 * @param input - import input.
 * @returns one merge-yaml file.
 */
export function ompFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const node = {
    baseUrl: endpointOf(input),
    apiKey: input.apiKey,
    api: protocolValue('pi-ai', input.apiFormat),
    models: [{ id: model, name: model }],
  }
  return [{
    path: joinPath(input.platform.home, ['.omp', 'agent', 'models.yml'], input.platform.platform),
    format: 'yaml',
    write: 'merge-yaml',
    content: yamlText({ providers: { [id]: node } }),
    fragment: yamlText({ providers: { [id]: node } }),
    managedKeys: [`providers.${id}`],
    note: '已存在 models.yaml 时 omp 优先读它；config.yml 里的默认模型不动。',
  }]
}
