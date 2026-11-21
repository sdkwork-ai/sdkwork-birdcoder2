/**
 * SDKWork 关于 (About) plugin, browser half.
 *
 * Registers the `关于` settings section (the durable About page), the
 * `shell.overlay` dialog the desktop application menu's About command opens, and
 * the `ctx.about` service that opens it. Both surfaces render the same content:
 * the product mark, the build version, the installation's registered app id, and
 * the deployment identity the platform resolves from the deployment access
 * token.
 *
 * Data ownership: the runtime owns the local build facts and the one installation
 * read; the SDK client is constructed in this apply closure (never in a
 * component), authenticated with the signed-in IAM session's credential pair,
 * and the response is re-validated before a component sees it.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the client runtime Context (ctx.slots) into this program.
import type {} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls ctx.locale into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls ctx.env (the deployment profile service) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
import type { EnvService } from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
// Type-only: pulls ctx.iam (the signed-in session credential source) into this program.
import type { IamService } from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
// Type-only: pulls ui-settings' settings.section declaration into this program.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createClient } from '@sdkwork/birdcoder2-app-sdk'
import { createTokenManager } from '@sdkwork/sdk-common'
import {
  ABOUT_REQUEST_TIMEOUT_MS, AboutRuntime,
  type AboutEnvironment, type InstallationApplicationPort,
} from './about-runtime.ts'
import { AboutDialog } from './AboutDialog.tsx'
import type { AboutInjected } from './about-face.ts'
import { AboutSection } from './AboutSection.tsx'
import { createAboutStore } from './about-store.ts'
import { en, zh } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.about'

/**
 * Required services (cordis fiber inject). `env` supplies the gateway profile and
 * `iam` the signed-in credential pair the installation read authenticates with;
 * `slots` and `locale` are the registration surfaces.
 */
export const inject = ['slots', 'locale', 'env', 'iam']

/** The product About dialog, openable from any surface that can reach cordis. */
export interface AboutService {
  /** Show the About dialog. */
  open(): void
  /** Dismiss the About dialog. */
  close(): void
  /** Re-read the installation application from the platform. */
  refresh(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The product About dialog (provided by ui-sdkwork-about). */
    about: AboutService
  }
}

/**
 * Build the installation read from the deployment profile.
 *
 * The read is `GET /app/v3/api/installation` through the generated App SDK: the
 * platform resolves the installation from the access token, so the response can
 * never disagree with the credential the page carries. Without a token (an
 * IAM-session-only launch) there is nothing to authenticate the read with, and
 * the About surface states that instead of guessing.
 * @param environment - deployment facts supplying the gateway origin and token.
 * @returns the read, or undefined when the deployment has no token configured.
 */
function createInstallationPort(environment: AboutEnvironment): InstallationApplicationPort | undefined {
  const baseUrl = environment.apiBaseUrl().trim().replace(/\/+$/u, '')
  const credentials = environment.credentials()
  if (baseUrl === '' || credentials === undefined) return undefined
  const client = createClient({
    baseUrl,
    platform: 'pc',
    authMode: 'dual-token',
    tokenManager: createTokenManager(credentials),
    timeout: ABOUT_REQUEST_TIMEOUT_MS,
  })
  return {
    retrieve: async ({ signal }) => {
      const application = await client.installation.retrieve({ signal, timeout: ABOUT_REQUEST_TIMEOUT_MS })
      return {
        appId: application.appId,
        tenantId: application.tenantId,
        organizationId: application.organizationId,
        releaseScope: application.releaseScope,
        environment: application.environment,
        deploymentMode: application.deploymentMode,
        product: {
          name: application.product.name,
          vendor: application.product.vendor,
          appKey: application.product.appKey,
          iconUrl: application.product.iconUrl,
          websiteUrl: application.product.websiteUrl,
          supportUrl: application.product.supportUrl,
          privacyPolicyUrl: application.product.privacyPolicyUrl,
          termsOfServiceUrl: application.product.termsOfServiceUrl,
        },
      }
    },
  }
}

/** Whether this page runs inside the desktop shell (its preload bridges are present). */
function runningInDesktopShell(): boolean {
  const globals = globalThis as { dshDesktop?: unknown; sdkworkDesktop?: unknown }
  return typeof globals.dshDesktop === 'object' || typeof globals.sdkworkDesktop === 'object'
}

/** The deployment facts the About runtime reads. */
function createAboutEnvironment(env: EnvService, iam: IamService): AboutEnvironment {
  return {
    version: () => process.env.DSH_CLIENT_VERSION,
    commit: () => process.env.DSH_CLIENT_COMMIT_HASH,
    dirty: () => process.env.DSH_CLIENT_GIT_DIRTY === 'true',
    declaredAppId: () => env.appId(),
    apiBaseUrl: () => env.apiBaseUrl(),
    credentials: () => {
      const tokens = iam.sessionTokens()
      const accessToken = tokens.accessToken?.trim() ?? ''
      const authToken = tokens.authToken?.trim() ?? ''
      // A dual-token read needs both halves; a half-signed-in session names no
      // installation, so the surface asks the user to sign in instead.
      return accessToken === '' || authToken === '' ? undefined : { accessToken, authToken }
    },
    environment: () => env.currentEnvironment(),
    appMode: () => runningInDesktopShell() ? 'desktop' : 'web',
    subscribe: (listener) => {
      const offEnvironment = env.subscribe(listener)
      const offSession = iam.onAuthToken(listener)
      return () => {
        offEnvironment()
        offSession()
      }
    },
  }
}

/**
 * The desktop shell's About bridge slice (`window.sdkworkDesktop.about`): the
 * application menu sends its command here, a page that mounted too late takes
 * the request once, and the shell supplies the installed version for pages built
 * without client build metadata.
 */
interface DesktopAboutBridge {
  onOpen(handler: () => void): () => void
  takePending(): Promise<boolean>
  facts?(): Promise<{ appVersion: string }>
}

function desktopAboutBridge(): DesktopAboutBridge | undefined {
  const bridge = (globalThis as {
    sdkworkDesktop?: { about?: Partial<DesktopAboutBridge> }
  }).sdkworkDesktop?.about
  if (bridge?.onOpen === undefined || bridge.takePending === undefined) return undefined
  return {
    onOpen: bridge.onOpen,
    takePending: bridge.takePending,
    ...bridge.facts === undefined ? {} : { facts: bridge.facts },
  }
}

/**
 * Register the About dictionaries, the `ctx.about` service, the settings section,
 * the dialog seat, and the desktop command listener.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-about: dictionaries')
  const t = ctx.locale.bind(NS)

  const runtime = new AboutRuntime(
    createAboutEnvironment(ctx.env, ctx.iam),
    environment => createInstallationPort(environment),
  )
  ctx.effect(() => {
    const stop = runtime.start()
    return () => {
      stop()
      runtime.dispose()
    }
  }, 'ui-sdkwork-about: installation read')

  // The dialog's visibility is shared viewing state: the runtime owns the facts,
  // this store owns only whether the dialog is on screen. One instance is created
  // here and handed to the registration, so the service and the rendered dialog
  // can never disagree.
  const handle = createAboutStore()
  const instance = handle.create()
  const store: typeof handle = { ...handle, create: () => instance }
  const service: AboutService = {
    open: () => { instance.actions.open() },
    close: () => { instance.actions.close() },
    refresh: () => { runtime.load() },
  }
  ctx.provide('about', service)

  const desktopAbout = desktopAboutBridge()
  if (desktopAbout !== undefined) {
    // A page assembled from partial client artifacts carries no build version;
    // the shell's installed version is the truthful fallback for that page.
    if (desktopAbout.facts !== undefined) {
      void desktopAbout.facts().then(
        (facts) => { runtime.setFallbackVersion(facts.appVersion) },
        (error: unknown) => { console.error('ui-sdkwork-about: desktop facts failed', error) },
      )
    }
    // The announcement and the pending request are one command: consume the
    // pending flag when the live event arrives, so a later page reload in this
    // process does not reopen the dialog from a request already served.
    ctx.effect(() => desktopAbout.onOpen(() => {
      service.open()
      void desktopAbout.takePending().catch((error: unknown) => {
        console.error('ui-sdkwork-about: desktop About command was not consumed', error)
      })
    }), 'ui-sdkwork-about: desktop About command')
    // A menu click that arrived before this plugin mounted is delivered once the
    // surface can actually open, not lost during boot.
    void desktopAbout.takePending().then(
      (pending) => { if (pending) service.open() },
      (error: unknown) => { console.error('ui-sdkwork-about: desktop About bridge failed', error) },
    )
  }

  const injected = (): AboutInjected => ({
    refresh: () => { runtime.load() },
    hooks: {
      local: runtime.local,
      installation: runtime.installation,
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'about',
    // After every feature page: About is reference material, not configuration.
    order: 1000,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, AboutSection))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'about',
    locale: NS,
    store,
    inject: injected,
  }, AboutDialog))
}
