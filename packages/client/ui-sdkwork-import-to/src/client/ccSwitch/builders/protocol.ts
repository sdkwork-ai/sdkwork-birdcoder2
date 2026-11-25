/**
 * Protocol strings the targets' live configs expect for each `apiFormat`.
 *
 * These are the values of CC Switch's `ApiFormat::native_value` matrix and of
 * its target config writers, so an import lands with the same field values
 * CC Switch writes.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import type { ApiFormat } from '../../types.ts'

/** `api` / `npm` / `api_mode` families this plugin writes. */
export type ProtocolFamily =
  | 'pi-ai' // OpenClaw, Pi, Oh My Pi, MiniMax Code, DeepSeek Harness: `api`
  | 'opencode-npm' // OpenCode: `npm`
  | 'hermes-mode' // Hermes: `api_mode`
  | 'kimi-type' // Kimi Code: `type`
  | 'grok-backend' // Grok Build: `api_backend`
  | 'codex-wire' // Codex: `wire_api`

/** Format → value table per family. */
const TABLES: Readonly<Record<ProtocolFamily, Partial<Record<ApiFormat, string>>>> = {
  'pi-ai': {
    anthropic: 'anthropic-messages',
    openai_chat: 'openai-completions',
    openai_responses: 'openai-responses',
    gemini_native: 'google-generative-ai',
  },
  'opencode-npm': {
    anthropic: '@ai-sdk/anthropic',
    openai_chat: '@ai-sdk/openai-compatible',
    openai_responses: '@ai-sdk/openai',
    gemini_native: '@ai-sdk/google',
  },
  'hermes-mode': {
    anthropic: 'anthropic_messages',
    openai_chat: 'chat_completions',
    openai_responses: 'codex_responses',
  },
  'kimi-type': {
    anthropic: 'anthropic',
    openai_chat: 'openai',
    openai_responses: 'openai_responses',
    gemini_native: 'google-genai',
  },
  'grok-backend': {
    openai_chat: 'openai',
    openai_responses: 'responses',
    anthropic: 'anthropic',
  },
  'codex-wire': {
    openai_responses: 'responses',
    openai_chat: 'chat',
  },
}

/**
 * Native value for one format.
 * @param family - target config family.
 * @param format - wire format.
 * @returns the target's own spelling.
 * @throws {TypeError} when the family does not support the format (the catalog
 *         only offers supported formats, so this is a programming error).
 */
export function protocolValue(family: ProtocolFamily, format: ApiFormat): string {
  const value = TABLES[family][format]
  if (value === undefined) throw new TypeError(`apiFormat ${format} is not supported by ${family}`)
  return value
}
