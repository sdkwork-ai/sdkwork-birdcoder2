/**
 * OpenClaw.
 *
 * `~/.openclaw/openclaw.json` keeps a `models` section in merge mode whose
 * `providers` map holds the gateway entries; field names are camelCase.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { jsonText } from '../format.ts'
import { endpointOf, modelOf, providerIdOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/**
 * OpenClaw's provider node.
 * @param input - import input.
 * @returns one merge-json file.
 */
export function openclawFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const node: Record<string, unknown> = {
    baseUrl: endpointOf(input),
    apiKey: input.apiKey,
    api: protocolValue('pi-ai', input.apiFormat),
  }
  if (model !== '') node.models = [{ id: model, name: model }]
  const document = { models: { mode: 'merge', providers: { [id]: node } } }
  return [{
    path: joinPath(input.platform.home, ['.openclaw', 'openclaw.json'], input.platform.platform),
    format: 'json',
    write: 'merge-json',
    content: jsonText(document),
    fragment: jsonText(document),
    managedKeys: [`models.providers.${id}`],
    note: 'models.mode 保持 merge，别的 provider 不会被替换。',
  }]
}
