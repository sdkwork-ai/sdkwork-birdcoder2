/**
 * CC Switch's `v1/import` provider link.
 *
 * The link is CC Switch's own "click use": it registers the provider from the
 * same field set this plugin projects into the live files and, with
 * `enabled=true`, switches the target to it immediately.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import type { ApiFormat, ImportTargetId } from '../types.ts'

/** Fields a provider link carries. */
export interface ProviderLinkInput {
  readonly app: ImportTargetId
  readonly name: string
  /** Endpoint for the chosen format, un-trimmed. */
  readonly endpoint: string
  readonly apiKey: string
  readonly model?: string
  readonly apiFormat: ApiFormat
  /** Relay homepage the provider card links to. */
  readonly homepage?: string
  /** Marks the imported provider as active; defaults to `true`. */
  readonly enabled?: boolean
}

/**
 * Build the provider link CC Switch imports.
 * @param input - link fields.
 * @returns `ccswitch://v1/import?...`.
 */
export function providerDeeplink(input: ProviderLinkInput): string {
  const params = new URLSearchParams()
  params.set('resource', 'provider')
  params.set('app', input.app)
  params.set('name', input.name)
  params.set('endpoint', input.endpoint)
  params.set('apiKey', input.apiKey)
  if (input.model !== undefined && input.model !== '') params.set('model', input.model)
  if (input.homepage !== undefined && input.homepage !== '') params.set('homepage', input.homepage)
  params.set('apiFormat', input.apiFormat)
  params.set('enabled', input.enabled === false ? 'false' : 'true')
  return `ccswitch://v1/import?${params.toString()}`
}
