/**
 * GitHub Copilot CLI.
 *
 * `~/.copilot/providers.json` keeps a `providers` array (name plus wire
 * settings) and a `models` array whose entries name their provider.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { jsonText } from '../format.ts'
import { endpointOf, providerIdOf } from './common.ts'

/** Wire setting Copilot needs per format. */
function copilotProviderNode(input: ImportInput): Record<string, unknown> {
  const common = { name: providerIdOf(input), baseUrl: endpointOf(input), apiKey: input.apiKey }
  switch (input.apiFormat) {
    case 'anthropic':
      return { type: 'anthropic', ...common }
    case 'openai_responses':
      return { type: 'openai', wireApi: 'responses', ...common }
    case 'openai_chat':
      return { type: 'openai', wireApi: 'completions', ...common }
    case 'gemini_native':
      throw new TypeError('Copilot CLI has no Gemini-native provider type')
  }
}

/**
 * Copilot CLI's live `providers.json`.
 * @param input - import input.
 * @returns one merge-json file.
 */
export function copilotFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const document = {
    providers: [copilotProviderNode(input)],
    models: [{ id: input.model, provider: id }],
  }
  return [{
    path: joinPath(input.platform.home, ['.copilot', 'providers.json'], input.platform.platform),
    format: 'json',
    write: 'merge-json',
    content: jsonText(document),
    fragment: jsonText(document),
    managedKeys: [`providers[name=${id}]`, `models[provider=${id}]`],
    note: 'providers 与 models 都是数组：按 name / provider 原位替换本家的条目。',
  }]
}
