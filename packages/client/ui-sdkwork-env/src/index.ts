/** Host registration for the ui-sdkwork-env settings section. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

import { projectSdkworkEnvBase } from './env-projection.ts'
import {
  SDKWORK_ENV_BOOT_GLOBAL, UI_ENV_ENVIRONMENT_FIELD, UiEnvSettingsFields,
  type SdkworkEnvProfile, type SdkworkEnvironment,
} from './env-settings.ts'

export {
  UI_ENV_ENVIRONMENT_FIELD, UI_ENV_NAMESPACE, UiEnvSettingsSchema,
  type SdkworkEnvProfile, type SdkworkEnvironment, type UiEnvSettings,
} from './env-settings.ts'
export { projectSdkworkEnvBase, resolveUiEnvEnvironment, SDKWORK_BASE_URL_KEYS } from './env-projection.ts'

const NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/

/**
 * Validate a settings namespace key and return it branded; malformed names
 * throw TypeError (the dsh-settings public API no longer exports a brand
 * function, so this package keeps its own).
 * @param value - candidate namespace key.
 * @returns the key branded as {@link SettingsNamespace}.
 */
export function settingsNamespace(value: string): SettingsNamespace {
  if (!NAMESPACE_PATTERN.test(value)) {
    throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`)
  }
  return value as SettingsNamespace
}

/**
 * Deployment environment settings projected to the browser.
 *
 * A plugin's own Config *is* its settings section: the Loader creates the
 * entry from the composition, and `volatile` is what keeps the fields live —
 * the browser half binds the same namespace through `configForms`. Every
 * field is live because the browser reads the whole section (`ctx.env`
 * resolves the active profile), so a non-volatile field would leave the
 * section without a form and the scope would never resolve it.
 */
export interface Config {
  /** The active environment; its profile feeds every sdkwork integration. */
  environment: Volatile<SdkworkEnvironment>
  development: Volatile<SdkworkEnvProfile>
  testing: Volatile<SdkworkEnvProfile>
  production: Volatile<SdkworkEnvProfile>
}

/** Live ui-sdkwork-env settings. */
export const Config = z.object({
  [UI_ENV_ENVIRONMENT_FIELD]: UiEnvSettingsFields[UI_ENV_ENVIRONMENT_FIELD].volatile(),
  development: UiEnvSettingsFields.development.volatile(),
  testing: UiEnvSettingsFields.testing.volatile(),
  production: UiEnvSettingsFields.production.volatile(),
})

/**
 * Keep the deployment environment section out of the shell's generated
 * settings pages — a deployment switches environment through its launch
 * environment or the profile, not a form — and publish the launch-environment
 * projection to the browser, which is the only place the env files cannot be
 * read. The projection lands before the settings scope resolves, and the
 * resolved document still wins over it, so a user edit always overrides the
 * launch environment.
 * @param ctx - Host context that may acquire the settings service.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
  ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
    table.push({
      kind: 'global',
      name: SDKWORK_ENV_BOOT_GLOBAL,
      value: projectSdkworkEnvBase(launchEnvironmentOf(ctx)),
    })
  })
}
