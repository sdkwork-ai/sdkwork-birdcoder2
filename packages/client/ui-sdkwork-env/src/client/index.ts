/**
 * SDKWork deployment environment plugin, browser half: provides the
 * `ctx.env` service (settings mirror + active-profile projection) that every
 * sdkwork integration plugin consumes for its base URL, app id, app key, and
 * static access token. The `ui-sdkwork-env` settings scope (active environment plus
 * one profile per environment) lands from the Host settings document.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ctx.settingsScope into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { UI_ENV_NAMESPACE, type UiEnvSettings } from '../env-settings.ts'
import { EnvService } from './env-service.ts'

export { EnvService } from './env-service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The deployment environment service (shared by sdkwork integration plugins). */
    env: EnvService
  }
}

/** Services required by the ui-sdkwork-env plugin (cordis fiber inject). */
export const inject = ['settingsScope']

/**
 * Register the environment service once its settings scope is available.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const scope = ctx.settingsScope.bind<UiEnvSettings>({ namespace: UI_ENV_NAMESPACE })
  ctx.provide('env', new EnvService(scope))
}
