/**
 * SDKWork cloudrouter API key management plugin, browser half: registers the
 * wide "API Key 管理" modal into the settings-menu shell's `settings.apiKeys`
 * seat (opened from the popover's feature row — the key table needs more
 * width than the settings panel provides).
 *
 * The host adapter constructs the generated cloudrouter app/models clients
 * from the shared ui-sdkwork-env and ui-sdkwork-iam services (via the global
 * token manager) and binds them through the api-keys service's injectable
 * seam, so the view stays host-agnostic and reusable.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ApiKeysModal } from './ApiKeysModal.tsx'
import { ApiKeyHost } from './apikeyHost.ts'
import { en, NS, zh } from './locales.ts'
import type { ApiKeyKey } from './locales.ts'

export type { ApiKeyHost, ApiKeyHostClients, ApiKeyHostEnvironment, ApiKeyHostIam, ApiKeyHostIamSession } from './apikeyHost.ts'
export type { ApiKeyLocaleFace, ApiKeysModalProps } from './ApiKeysModal.tsx'
export type { ApiKeyKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork api-key management plugin copy. */
    apikey: ApiKeyKey
  }
}

/** Required services for locale registration, the host adapter, and the modal contribution. */
export const inject = ['slots', 'locale', 'env', 'iam']

/**
 * Client plugin body: register the dictionaries, the host adapter, and the
 * API-key management modal.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-apikey: dictionaries')

  const host = new ApiKeyHost({
    env: ctx.get('env'),
    iam: ctx.get('iam'),
  })
  host.mount()
  ctx.effect(() => () => { host.dispose() }, 'ui-sdkwork-apikey: SDKWork host adapter')

  const locale = ctx.get('locale')
  ctx.slots.inject('settings.apiKeys', () => ctx.slots.register({
    name: 'settings.apiKeys',
    locale: NS,
    inject: () => ({
      host,
      // The locale service doubles as the reactive LocaleFace the modal maps
      // onto the cloudrouter catalog locale. Closure-wrapped on purpose:
      // React's useSyncExternalStore invokes getSnapshot/subscribe UNBOUND,
      // and the service's getSnapshot reads `this.snapshot` — handing the
      // bare methods through crashed every modal render with "Cannot read
      // properties of undefined (reading 'snapshot')" (the deploy sibling
      // documents the same crash at its inject site).
      locale: {
        getSnapshot: () => locale.getSnapshot(),
        subscribe: listener => locale.subscribe(listener),
      },
    }),
  }, ApiKeysModal))
}
