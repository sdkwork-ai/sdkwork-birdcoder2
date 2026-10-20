/**
 * OEM profile plugin: resolves one deployment-owned JSON file at boot, exposes
 * it as `ctx.oem` for the composition's config expressions, and publishes the
 * browser-visible subset through the Web index injection. The DeepSeek login
 * provider keeps its official flow; only its origins come from this service.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import Schema from '@deepseek-ai/schemastery'
import { OEM_BOOT_GLOBAL, oemBootConfig, readOemConfig, resolveOemEnvironment, type OemApplicationConfig, type OemBrandConfig, type OemConfig, type OemDeepSeekConfig, type OemEnvironment, type OemSdkworkConfig } from './config.ts'

export * from './config.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'sdkwork-oem'

/** Loader entry configuration. */
export interface Config {
  /** Absolute OEM profile path; omitted reads the Harness home's `oem.json`. */
  configFile?: string
  /** Lifecycle override; omitted resolves `SDKWORK_*` then the dev flags. */
  environment?: OemEnvironment
}

export const Config = Schema.object({
  configFile: Schema.string(),
  environment: Schema.union([
    Schema.const('development'),
    Schema.const('testing'),
    Schema.const('staging'),
    Schema.const('production'),
  ]),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Resolved OEM profile: DeepSeek origins and the display brand. */
    oem: OemService
  }
}

/** The resolved OEM profile behind `ctx.oem`. */
export class OemService {
  /** @param config - validated profile. */
  constructor(readonly config: OemConfig) {}

  /**
   * Lifecycle whose service domains the resolved profile follows.
   * @returns the resolved environment.
   */
  get environment(): OemEnvironment {
    return this.config.environment
  }

  /**
   * Display identity every branded surface renders.
   * @returns the resolved brand.
   */
  get brand(): OemBrandConfig {
    return this.config.brand
  }

  /**
   * The deployment's own hosted origins.
   * @returns the resolved application surface.
   */
  get application(): OemApplicationConfig {
    return this.config.application
  }

  /**
   * SDKWork services one deployment repoints.
   * @returns the resolved SDKWork surface.
   */
  get sdkwork(): OemSdkworkConfig {
    return this.config.sdkwork
  }

  /**
   * DeepSeek endpoints the login and model providers use.
   * @returns the resolved endpoint set.
   */
  get deepseek(): OemDeepSeekConfig {
    return this.config.deepseek
  }
}

/**
 * Resolve the profile once, publish it to the Host, and hand its public subset
 * to every Web index render.
 * @param ctx - Host context owning the plugin fiber.
 * @param config - loader entry configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const environment = config.environment ?? resolveOemEnvironment(process.env)
  const service = new OemService(readOemConfig(config.configFile, environment))
  ctx.provide('oem', service)
  ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
    table.push({ kind: 'global', name: OEM_BOOT_GLOBAL, value: oemBootConfig(service.config) })
  })
}
