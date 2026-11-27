import { describe, expect, it, vi } from 'vitest'
import type { OpenAICompletionsCompat } from '@earendil-works/pi-ai'
import { resolveProfiles } from '../src/config.ts'
import { relayVendorDialect } from '../src/relay.ts'
import { capturePayload, VENDOR_CONTRACTS } from './relay-vendor-contract.ts'

const KEY_ENV = 'PI_RELAY_CONTRACT_KEY'
vi.stubEnv(KEY_ENV, 'test-key')

/**
 * Every relay model on its OpenAI-compatible face, resolved the way a profile
 * that sets `api: openai-completions` resolves it.
 */
function openAiFaceModels(provider: 'birdcoder' | 'sdkwork' = 'birdcoder') {
  const profiles = provider === 'birdcoder'
    ? { birdcoder: { api: 'openai-completions', apiKeyEnv: KEY_ENV } }
    : { sdkwork: { apiKeyEnv: KEY_ENV } }
  return resolveProfiles(profiles).get(provider)?.piProvider?.getModels() ?? []
}

/** One model per vendor, so each vendor's contract is exercised without repeating it 5×. */
function oneModelPerVendor(provider: 'birdcoder' | 'sdkwork' = 'birdcoder') {
  const seen = new Map<string, ReturnType<typeof openAiFaceModels>[number]>()
  for (const model of openAiFaceModels(provider)) {
    const vendor = model.id.slice(0, model.id.indexOf('/'))
    if (!seen.has(vendor)) seen.set(vendor, model)
  }
  return seen
}

describe('relay vendor wire contract', () => {
  it('covers every OpenAI-compatible chat vendor the seed actually carries', () => {
    // A new vendor cannot arrive without someone transcribing its reference:
    // this fails until VENDOR_CONTRACTS names it. Vendors whose relay faces
    // speak another protocol (Anthropic, Gemini) take no OpenAI dialect here;
    // they are checked on their own face instead.
    const seeded = [...oneModelPerVendor().keys()]
      .filter(vendor => vendor !== 'anthropic' && vendor !== 'google')
      .sort()
    expect(seeded).toEqual(Object.keys(VENDOR_CONTRACTS).sort())
  })

  describe.each(Object.entries(VENDOR_CONTRACTS))('%s', (vendor, contract) => {
    it('sends the output cap in the field this vendor documents', async () => {
      const model = oneModelPerVendor().get(vendor)
      expect(model, `${vendor} is seeded`).toBeDefined()
      const { body } = await capturePayload(model!, undefined, 12_345)

      expect(body[contract.capField]).toBe(12_345)
      const other = contract.capField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'
      expect(body).not.toHaveProperty(other)
    })

    it('never asks for an OpenAI store', async () => {
      const { body } = await capturePayload(oneModelPerVendor().get(vendor)!, undefined)
      expect(body).not.toHaveProperty('store')
    })

    it('declares the thinking dialect its reference documents', () => {
      const compat = oneModelPerVendor().get(vendor)?.compat as OpenAICompletionsCompat | undefined
      const expected = {
        deepseek: 'deepseek', qwen: 'qwen', 'moonshot-thinking': 'string-thinking', 'reasoning-effort': 'openai',
      }[contract.thinking ?? 'reasoning-effort']
      expect(`${vendor}:${compat?.thinkingFormat}`).toBe(`${vendor}:${expected}`)
    })

    if (contract.thinking !== undefined) {
      it('turns thinking ON in the field and value this vendor reads', async () => {
        const model = oneModelPerVendor().get(vendor)!
        if (!model.reasoning) return
        const { body } = await capturePayload(model, 'high', 8192)
        switch (contract.thinking) {
          case 'deepseek':
            // DeepSeek/Zhipu/Bytedance read `thinking.type`, plus an effort when supported.
            expect(body['thinking']).toEqual({ type: 'enabled' })
            break
          case 'qwen':
            // Alibaba reads a top-level boolean and ignores `thinking`.
            expect(body['enable_thinking']).toBe(true)
            expect(body).not.toHaveProperty('thinking')
            break
          case 'moonshot-thinking':
            expect(typeof body['thinking']).toBe('string')
            expect(body['thinking']).not.toBe('none')
            break
          case 'reasoning-effort':
            expect(typeof body['reasoning_effort']).toBe('string')
            expect(body).not.toHaveProperty('thinking')
            break
        }
      })
    }

    it('never sends pi-ai’s nested reasoning object', async () => {
      // The wrong dialect writes `reasoning: { effort }`, which every vendor
      // here ignores — the failure mode this whole table exists to prevent.
      const model = oneModelPerVendor().get(vendor)!
      const { body } = await capturePayload(model, model.reasoning ? 'high' : undefined)
      expect(body).not.toHaveProperty('reasoning')
    })
  })

  it('replays reasoning_content for DeepSeek only', () => {
    const models = oneModelPerVendor()
    const requires = (vendor: string): boolean =>
      (models.get(vendor)?.compat as OpenAICompletionsCompat | undefined)
        ?.requiresReasoningContentOnAssistantMessages === true
    expect(requires('deepseek')).toBe(true)
    for (const vendor of Object.keys(VENDOR_CONTRACTS).filter(entry => entry !== 'deepseek')) {
      expect(`${vendor}:${requires(vendor)}`).toBe(`${vendor}:false`)
    }
  })

  it('falls back to the universally accepted cap for a vendor it cannot name', () => {
    expect(relayVendorDialect('vendor-shipped-after-this-build')).toEqual({
      maxTokensField: 'max_tokens',
      thinkingFormat: 'openai',
      requiresReasoningContent: false,
    })
  })
})

describe('relay dialect survives a protocol repoint', () => {
  it('keeps the vendor dialect on the SDKWork route, which ships OpenAI natively', () => {
    // The SDKWork route is OpenAI-compatible by default, so it takes the
    // no-repoint path through request resolution; BirdCoder reaches the same
    // face only by repoint. Both must produce the same dialect.
    const sdkwork = oneModelPerVendor('sdkwork')
    for (const [vendor, contract] of Object.entries(VENDOR_CONTRACTS)) {
      const compat = sdkwork.get(vendor)?.compat as OpenAICompletionsCompat | undefined
      if (compat === undefined) continue
      expect(`${vendor}:${compat.maxTokensField}`).toBe(`${vendor}:${contract.capField}`)
    }
  })

  it('lets a deployment move only the output-cap field, never the thinking dialect', () => {
    const moved = resolveProfiles({
      birdcoder: {
        api: 'openai-completions',
        apiKeyEnv: KEY_ENV,
        compat: { maxTokensField: 'max_completion_tokens' } as never,
      },
    }).get('birdcoder')?.piProvider?.getModels() ?? []
    expect(moved).not.toHaveLength(0)
    for (const model of moved) {
      const compat = model.compat as OpenAICompletionsCompat | undefined
      // The moved field sticks...
      expect(compat?.maxTokensField).toBe('max_completion_tokens')
      // ...while the vendor's own thinking dialect is still asserted.
      const vendor = model.id.slice(0, model.id.indexOf('/'))
      if (VENDOR_CONTRACTS[vendor] === undefined) continue
      expect(compat?.thinkingFormat).toBe(relayVendorDialect(vendor).thinkingFormat)
      expect(compat?.supportsStore).toBe(false)
    }
  })
})
