/**
 * The shipped fork composition starts on BirdCoder rather than the official
 * DeepSeek route. This pins the two patch rows that carry that decision: the
 * relay profile and the deployment default, so an unrelated patch refactor
 * cannot silently restore the upstream default.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { resolveProfiles } from '../../../llm/llm-pi-ai/src/config.ts'
import type { PiAiProviderProfile } from '../../../llm/llm-pi-ai/src/config.ts'

const patchPath = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))

/** Every row the patch list inserts or addresses, in composition order. */
function rows(): EntryOptions[] {
  const parsed = yaml.load(readFileSync(patchPath, 'utf8'), { schema: entryListSchema }) as
    | ({ insert?: EntryOptions[] } & EntryOptions)[]
    | undefined
  return (parsed ?? []).flatMap(patch => patch.insert === undefined ? [patch] : patch.insert)
}

describe('web-app BirdCoder default', () => {
  it('ships the relay profile before any sign-in', () => {
    const row = rows().find(candidate => candidate.id === 'llm-pi-ai')
    expect(row?.config).toMatchObject({
      providers: {
        birdcoder: {
          api: 'openai-completions',
          apiKeyEnv: 'BIRDCODER_API_KEY',
        },
      },
    })
  })

  it('starts every fresh session on a shipped BirdCoder model', () => {
    const row = rows().find(candidate => candidate.id === 'agent-default-model')
    expect(row?.config).toEqual({
      provider: 'birdcoder',
      model: 'deepseek/deepseek-v4-pro',
    })
  })

  it('resolves the shipped default model on the relay route', () => {
    const defaults = rows().find(candidate => candidate.id === 'agent-default-model')?.config as {
      provider: string
      model: string
    }
    const relayConfig = rows().find(candidate => candidate.id === 'llm-pi-ai')?.config as {
      providers: Record<string, PiAiProviderProfile>
    }
    const relay = resolveProfiles(relayConfig.providers).get('birdcoder')
    expect(relay?.api).toBe('openai-completions')
    expect(relay?.apiKeyEnv).toBe('BIRDCODER_API_KEY')
    expect(relay?.catalogError).toBeUndefined()
    expect(relay?.piProvider?.getModels().some(model => model.id === defaults.model)).toBe(true)
  })
})
