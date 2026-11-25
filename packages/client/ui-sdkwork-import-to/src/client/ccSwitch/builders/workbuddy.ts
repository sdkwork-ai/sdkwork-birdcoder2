/**
 * WorkBuddy.
 *
 * `~/.workbuddy/models.json` keeps one flat `models` array; a provider becomes
 * one entry per model, carrying the shared vendor / URL / key fields and the
 * owner id WorkBuddy uses to attribute the card.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { jsonText } from '../format.ts'
import { endpointOf, providerIdOf } from './common.ts'

/**
 * WorkBuddy's model entry.
 * @param input - import input.
 * @returns one merge-json file.
 */
export function workbuddyFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const entry = {
    id: input.model,
    supportsToolCall: true,
    vendor: input.name,
    url: endpointOf(input),
    apiKey: input.apiKey,
    name: input.name,
    ccSwitchProviderId: id,
  }
  return [{
    path: joinPath(input.platform.home, ['.workbuddy', 'models.json'], input.platform.platform),
    format: 'json',
    write: 'merge-json',
    content: jsonText({ models: [entry] }),
    fragment: jsonText({ models: [entry] }),
    managedKeys: [`models[id=${input.model}]`],
    note: '同一模型 id 只能属于一张卡片：已在别的卡片里时 CC Switch 报错而不是覆盖。若 models.json 的 availableModels 是非空白名单，还要把该模型 id 追加进去，否则菜单不显示它。',
  }]
}
