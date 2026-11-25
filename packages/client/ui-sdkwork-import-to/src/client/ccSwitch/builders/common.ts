/**
 * Shared helpers for the per-target projections.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { envReferenceFor, providerIdFor, trimEndpoint } from '../format.ts'
import type { ApiFormat, ImportInput, TargetDescriptor } from '../../types.ts'

/**
 * Endpoint a format uses: the Anthropic gateway for `anthropic`, the Gemini
 * gateway for `gemini_native`, and the OpenAI-compatible gateway otherwise.
 * @param input - import input.
 * @returns the trimmed endpoint.
 */
export function endpointOf(input: ImportInput): string {
  const raw = endpointForFormat(input.endpoints, input.apiFormat)
  return trimEndpoint(raw)
}

/**
 * Untrimmed endpoint for one format.
 * @param endpoints - relay endpoints.
 * @param format - wire format.
 * @returns the endpoint URL.
 */
export function endpointForFormat(
  endpoints: ImportInput['endpoints'],
  format: ApiFormat,
): string {
  switch (format) {
    case 'anthropic':
      return endpoints.anthropicBaseUrl
    case 'gemini_native':
      return endpoints.geminiBaseUrl
    case 'openai_chat':
    case 'openai_responses':
      return endpoints.openAiBaseUrl
  }
}

/**
 * Stable provider id for the import.
 * @param input - import input.
 * @returns `input.providerId` when given, else the name's slug.
 */
export function providerIdOf(input: ImportInput): string {
  return input.providerId !== undefined && input.providerId !== ''
    ? input.providerId
    : providerIdFor(input.name)
}

/**
 * Environment reference DeepSeek Harness resolves the key from.
 * @param providerId - provider id.
 * @returns `BIRDCODER_DSH_<ID>` in upper snake case.
 */
export function dshKeyReference(providerId: string): string {
  return `BIRDCODER_DSH_${envReferenceFor(providerId)}`
}

/**
 * Model an import carries, falling back to a target default.
 * @param input - import input.
 * @param fallback - value used when the field is empty.
 * @returns the model id.
 */
export function modelOf(input: ImportInput, fallback = ''): string {
  return input.model !== undefined && input.model !== '' ? input.model : fallback
}

/**
 * Whether the target needs a model before the plan can be produced.
 * @param target - target descriptor.
 * @param input - import input.
 * @returns `true` when the target requires a model and none was given.
 */
export function needsModel(target: TargetDescriptor, input: ImportInput): boolean {
  return target.requiresModel && modelOf(input) === ''
}
