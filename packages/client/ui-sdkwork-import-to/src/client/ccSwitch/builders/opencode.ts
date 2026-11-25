/**
 * OpenCode.
 *
 * `~/.config/opencode/opencode.json` keeps one legacy `provider` map whose
 * entries name an AI SDK package plus its options and models.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { jsonText } from '../format.ts'
import { endpointOf, modelOf, providerIdOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/**
 * OpenCode's provider entry under `provider.<id>`.
 * @param input - import input.
 * @returns the live file.
 */
export function opencodeFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const models: Record<string, { name: string }> = {}
  if (model !== '') models[model] = { name: model }
  const node = {
    npm: protocolValue('opencode-npm', input.apiFormat),
    options: { baseURL: endpointOf(input), apiKey: input.apiKey },
    models,
  }
  return [{
    path: joinPath(input.platform.config, ['opencode', 'opencode.json'], input.platform.platform),
    format: 'json',
    write: 'merge-json',
    content: jsonText({ provider: { [id]: node } }),
    fragment: jsonText({ provider: { [id]: node } }),
    managedKeys: [`provider.${id}`],
    note: '已存在 opencode.jsonc 时 OpenCode 优先读它；把同样的 provider 节点写进 jsonc 即可。',
  }]
}
