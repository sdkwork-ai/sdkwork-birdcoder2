/**
 * SDKWork IM host adapter, browser half: provides `ctx.im`, the service the
 * chat and contacts mode pages use to mount SDKWork IM surfaces.
 *
 * The IM product UI ships as a bundle the deployment serves, so this plugin
 * compiles no IM sources: it loads the bundle once, hands it the gateway
 * origin, IAM session, and frame language, and mounts the requested surface
 * into the host-owned container.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls ctx.env, ctx.iam, ctx.layout, and ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type { IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ImService } from './im-service.ts'

export { ImService } from './im-service.ts'
export type {
  ImErrorCode,
  ImMountStatus,
  ImNotice,
  ImSnapshot,
  ImSurfaceHandle,
  ImSurfaceKind,
  ImSurfaceMountRequest,
} from './im-service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The embedded SDKWork IM runtime adapter (mount surfaces, unread, selection). */
    im: ImService
  }
}

/** Services required by the IM host adapter. */
export const inject = ['env', 'iam', 'layout', 'locale']

/**
 * Provide `ctx.im` and start following the session.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const service = new ImService(
    ctx.get('env') as EnvService,
    ctx.get('iam') as IamService,
    ctx.get('layout') as ILayout,
    ctx.locale,
  )
  ctx.provide('im', service)
  ctx.effect(() => service.start(), 'ui-sdkwork-im: embedded IM runtime')
}
