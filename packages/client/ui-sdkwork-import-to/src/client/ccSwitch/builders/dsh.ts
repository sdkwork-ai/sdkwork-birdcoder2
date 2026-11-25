/**
 * DeepSeek Harness.
 *
 * Harness profiles layer `cordis.patch.yml` on top of the bundled config, so a
 * provider is an `llm-pi-ai` row in each profile's patch; the key itself stays
 * out of the patch and in `.credentials.yaml` behind an `apiKeyEnv` reference.
 * Web and Desktop are the profiles Harness always prepares; Headless and ACP
 * patches exist only when those profiles were initialized.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { joinPath } from '../../platform.ts'
import type { ImportFile, ImportInput } from '../../types.ts'
import { yamlText, type YamlValue } from '../format.ts'
import { dshKeyReference, endpointOf, modelOf, providerIdOf } from './common.ts'
import { protocolValue } from './protocol.ts'

/**
 * Harness home directory the patches live under.
 * @param input - import input.
 * @returns the absolute `~/.dsh` path for the import's platform.
 */
export function dshHome(input: ImportInput): string {
  return joinPath(input.platform.home, ['.dsh'], input.platform.platform)
}

/**
 * The provider row every profile patch carries.
 * @param input - import input.
 * @returns the `llm-pi-ai` patch row.
 */
function providerRow(input: ImportInput, id: string, model: string, endpoint: string): Record<string, YamlValue> {
  return {
    id: 'llm-pi-ai',
    config: {
      providers: {
        [id]: {
          api: protocolValue('pi-ai', input.apiFormat),
          displayName: input.name,
          baseURL: endpoint,
          apiKeyEnv: dshKeyReference(id),
          models: [{ id: model, name: model }],
        },
      },
    },
  }
}

/**
 * Harness patches and credentials.
 * @param input - import input.
 * @returns two profile patches and the credentials file.
 */
export function dshFiles(input: ImportInput): readonly ImportFile[] {
  const id = providerIdOf(input)
  const model = modelOf(input)
  const endpoint = endpointOf(input)
  const row = providerRow(input, id, model, endpoint)
  const patch = yamlText([row])
  const home = dshHome(input)
  const credentials = yamlText({
    version: 1,
    refs: { [dshKeyReference(id)]: input.apiKey },
    records: {},
  })
  return [
    {
      path: joinPath(home, ['profiles', 'web', 'cordis.patch.yml'], input.platform.platform),
      format: 'yaml',
      write: 'merge-yaml',
      content: patch,
      fragment: patch,
      managedKeys: [`llm-pi-ai.config.providers.${id}`],
      note: 'home 级 cordis.patch.yml 若已有带 config 的 llm-pi-ai，会覆盖这里的 provider，先移除它。',
    },
    {
      path: joinPath(home, ['profiles', 'desktop', 'cordis.patch.yml'], input.platform.platform),
      format: 'yaml',
      write: 'merge-yaml',
      content: patch,
      fragment: patch,
      managedKeys: [`llm-pi-ai.config.providers.${id}`],
      note: 'profiles/headless 与 profiles/acp 也初始化过时，把同一行写进它们的 cordis.patch.yml。',
    },
    {
      path: joinPath(home, ['.credentials.yaml'], input.platform.platform),
      format: 'yaml',
      write: 'merge-yaml',
      content: credentials,
      fragment: yamlText({ refs: { [dshKeyReference(id)]: input.apiKey } }),
      managedKeys: [`refs.${dshKeyReference(id)}`],
      role: 'credentials',
      note: 'Key 只存在这里；patch 通过 apiKeyEnv 引用它。',
    },
  ]
}
