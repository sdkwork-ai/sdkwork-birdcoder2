import { describe, expect, it, vi } from 'vitest'
import type { Model, OpenAICompletionsCompat } from '@earendil-works/pi-ai'
import { getSupportedThinkingLevels, type Api } from '../src/models.ts'
import { resolveProfiles } from '../src/config.ts'
import { capturePayload, VENDOR_CONTRACTS } from './relay-vendor-contract.ts'

const KEY_ENV = 'PI_RELAY_THINKING_KEY'
vi.stubEnv(KEY_ENV, 'test-key')

/**
 * The reasoning levels a Settings/Model-picker surface renders for a model,
 * which is exactly what `getSupportedThinkingLevels` answers.
 */
function offeredLevels(model: Model<Api>): string[] {
  return [...getSupportedThinkingLevels(model)]
}

/** One model per vendor on the BirdCoder OpenAI face. */
function openAiFaceByVendor(): Map<string, Model<Api>> {
  const models = resolveProfiles({
    birdcoder: { api: 'openai-completions', apiKeyEnv: KEY_ENV },
  }).get('birdcoder')?.piProvider?.getModels() ?? []
  const byVendor = new Map<string, Model<Api>>()
  for (const model of models) {
    const vendor = model.id.slice(0, model.id.indexOf('/'))
    if (!byVendor.has(vendor)) byVendor.set(vendor, model)
  }
  return byVendor
}

describe('a level the picker offers always travels to the vendor', () => {
  it('offers at least one thinking level for every reasoning model the seed carries', () => {
    for (const [vendor, model] of openAiFaceByVendor()) {
      if (!model.reasoning) {
        // A non-reasoning model offers "off" alone, and its request carries no switch.
        expect(`${vendor}:${JSON.stringify(offeredLevels(model))}`).toBe(`${vendor}:["off"]`)
        continue
      }
      const levels = offeredLevels(model).filter(level => level !== 'off')
      expect(`${vendor}:${levels.length > 0}`).toBe(`${vendor}:true`)
      // Every offered level must have a wire spelling; otherwise the picker
      // shows a choice the request cannot express.
      for (const level of levels) {
        const wire = model.thinkingLevelMap?.[level as keyof typeof model.thinkingLevelMap]
        expect(`${vendor}/${level}:${typeof wire}`).toBe(`${vendor}/${level}:string`)
      }
    }
  })

  it.each(Object.entries(VENDOR_CONTRACTS))(
    'sends what the %s picker selected, in that vendor’s own field',
    async (vendor, contract) => {
      const model = openAiFaceByVendor().get(vendor)
      expect(model, `${vendor} is seeded`).toBeDefined()
      if (model!.reasoning !== true) return

      for (const level of offeredLevels(model!).filter(entry => entry !== 'off')) {
        const { body } = await capturePayload(model!, level, 8192)
        switch (contract.thinking) {
          case 'deepseek':
            expect(`${vendor}/${level}:${JSON.stringify(body['thinking'])}`).toBe(`${vendor}/${level}:{"type":"enabled"}`)
            break
          case 'qwen':
            expect(`${vendor}/${level}:${String(body['enable_thinking'])}`).toBe(`${vendor}/${level}:true`)
            break
          case 'moonshot-thinking':
            expect(`${vendor}/${level}:${typeof body['thinking']}`).toBe(`${vendor}/${level}:string`)
            break
          case 'reasoning-effort':
            expect(`${vendor}/${level}:${typeof body['reasoning_effort']}`).toBe(`${vendor}/${level}:string`)
            break
          default:
            // The vendor publishes no thinking field, so nothing may be sent.
            expect(body).not.toHaveProperty('thinking')
            expect(body).not.toHaveProperty('reasoning')
            expect(body).not.toHaveProperty('enable_thinking')
            break
        }
      }
    },
  )

  it('turns thinking off in the dialect each vendor reads', async () => {
    for (const [vendor, model] of openAiFaceByVendor()) {
      const contract = VENDOR_CONTRACTS[vendor]
      if (contract?.thinking === undefined || model.reasoning !== true) continue
      const levels = offeredLevels(model)
      // "off" is only selectable when the model maps it to a wire value.
      if (!levels.includes('off')) continue
      const { body } = await capturePayload(model, undefined, 8192)
      switch (contract.thinking) {
        case 'deepseek':
          expect(`${vendor}:${JSON.stringify(body['thinking'])}`).toBe(`${vendor}:{"type":"disabled"}`)
          break
        case 'qwen':
          expect(`${vendor}:${String(body['enable_thinking'])}`).toBe(`${vendor}:false`)
          break
        case 'moonshot-thinking':
          expect(body['thinking']).toBe('none')
          break
        case 'reasoning-effort':
          // An OpenAI-style vendor expresses "off" by omitting the effort.
          expect(body).not.toHaveProperty('reasoning_effort')
          break
      }
    }
  })

  it('never offers a level the vendor cannot be told about', () => {
    // A vendor with no published thinking field must not advertise thinking
    // levels, because choosing one would change nothing on the wire.
    const silent = Object.entries(VENDOR_CONTRACTS)
      .filter(([, contract]) => contract.thinking === undefined)
      .map(([vendor]) => vendor)
    for (const vendor of silent) {
      const model = openAiFaceByVendor().get(vendor)
      expect(model, `${vendor} is seeded`).toBeDefined()
      expect(`${vendor}:${model!.reasoning ?? false}`).toBe(`${vendor}:false`)
    }
  })
})

describe('the engine a relay model declares reaches the wire', () => {
  it('honours the configured thinking level for a OpenAI-face relay model', async () => {
    // A profile can name `reasoningEfforts` per model; the wire must carry the
    // mapped spelling, not the raw level id.
    const models = resolveProfiles({
      birdcoder: {
        api: 'openai-completions',
        apiKeyEnv: KEY_ENV,
        modelOverrides: { 'deepseek/deepseek-flash': { reasoningEfforts: { off: null, high: 'high', max: 'ultra' } } },
      },
    }).get('birdcoder')?.piProvider?.getModels() ?? []
    const model = models.find(entry => entry.id === 'deepseek/deepseek-flash')
    expect(model).toBeDefined()
    expect(offeredLevels(model!)).toEqual(['off', 'high', 'max'])
    const { body } = await capturePayload(model!, 'max', 8192)
    // `max` is mapped to the deployment's own spelling.
    expect(body['reasoning_effort']).toBe('ultra')
    expect(body['max_tokens']).toBe(8192)
    expect((model!.compat as OpenAICompletionsCompat | undefined)?.maxTokensField).toBe('max_tokens')
  })
})
