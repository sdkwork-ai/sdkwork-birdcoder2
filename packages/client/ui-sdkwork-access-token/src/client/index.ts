/**
 * SDKWork access-token initializer, browser half: provides the initializer
 * service the workspace row menu opens, hosts the dialog on the frame's
 * floating layer, and contributes the same verb to the shared workspace
 * context menu (the path a composition without the SDKWork row-menus plugin
 * still gets).
 *
 * The dialog writes the public application access token of every selected
 * manifest-bearing application root: tenant-level or organization-level, per
 * `APP_ACCESS_TOKEN_SPEC.md`. File access goes through the `uiWorkspace`
 * directory bridge, so the browser never touches the filesystem directly.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
/** Type-only: pulls ctx.contextMenus and the workspace target family. */
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
// Type-only: pulls the shell.overlay slot declaration.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls ctx.slots (SlotRegistry) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `workspace` ContextMenuTargetMap row this plugin reads.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls ctx.env (gateway base URL and public bootstrap token).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-env/client'
// Type-only: pulls ctx.iam (current session credentials and account identity).
import type {} from '@deepseek-ai/dsh-client-ui-sdkwork-iam/client'
// Type-only: pulls ctx.configForms and the settings-section contract.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  ACCESS_TOKEN_CONFIG_FILE_GLOBAL, ACCESS_TOKEN_NAMESPACE, ACCOUNTS_FIELD, decodeAccessTokenConfigPath,
  findAccessTokenAccount, upsertAccessTokenAccount,
  type SdkworkAccessTokenSettings,
} from '../access-token-settings.ts'
import { AccessTokenDialog } from './AccessTokenDialog.tsx'
import type { AccessTokenDialogInjected } from './AccessTokenDialog.tsx'
import type { AccessTokenCredentialsFace } from './credentials-contract.ts'
import type { AccessTokenFileSystem } from './project.ts'
import { basenameOf, isSdkworkProjectDirectory } from './paths.ts'
import { createSdkworkIamAccessPort } from './sdkworkIamPort.ts'
import type { SdkworkSession } from './signedToken.ts'
import { resolveSdkworkGateway, userIdOfToken } from './signedToken.ts'
import type { SignedAccessFeatures } from './SignedTokenPanel.tsx'
import { createAccessTokenDialogStore } from './store.ts'
import { en, zh, type SdkworkAccessTokenKey } from './locales.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'sdkworkAccessToken'

/** Order of the shared context-menu contribution among workspace actions. */
const WORKSPACE_CONTEXT_MENU_ORDER = 250

/** Request handed to {@link AccessTokenInitializerService.open}. */
export interface AccessTokenInitializerOpenOptions {
  /** Absolute project directory of the clicked workspace row. */
  directory: string
  /** Display title of the row; defaults to the directory name. */
  displayTitle?: string | undefined
}

/**
 * Service the workspace row menus dispatch into. Structural port: the row-menu
 * plugin only needs the one verb, so a missing initializer plugin keeps its
 * menu row hidden instead of failing the menu.
 */
export interface AccessTokenInitializerService {
  /** Open the initializer dialog for one project directory. */
  open(options: AccessTokenInitializerOpenOptions): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** SDKWork access-token initializer; absent when this plugin is not loaded. */
    accessTokenInitializer: AccessTokenInitializerService
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** SDKWork access-token initializer copy. */
    sdkworkAccessToken: SdkworkAccessTokenKey
  }
}

/** Services this plugin consumes. */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Register the initializer service, the dialog, and the shared context-menu
 * verb.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sdkwork-access-token: dictionaries')

  const store = createAccessTokenDialogStore()
  // One instance: the service opens/closes the same state the overlay entry
  // reads, matching the renderer's store handle shape.
  const instance = store.create()
  const uiStore: typeof store = { ...store, create: () => instance }

  /** Current directory bridge; the service is optional in minimal compositions. */
  const fileSystem = (): AccessTokenFileSystem | undefined =>
    ctx.get('uiWorkspace')

  /** Gateway facts of the active environment profile. */
  const environmentFacts = (): { baseUrl: string; bootstrapAccessToken: string } => {
    const env = ctx.get('env')
    return {
      baseUrl: env?.apiBaseUrl() ?? '',
      bootstrapAccessToken: env?.accessToken() ?? '',
    }
  }

  const port = createSdkworkIamAccessPort()

  /**
   * Current mounted IAM session as the signed flow's credentials.
   *
   * The account id is the ownership filter key: without it the exchange could
   * not prove the caller created the selected application, so the session stays
   * unavailable and the panel asks for a login instead.
   */
  const currentSession = (gateway: { baseUrl: string }): SdkworkSession | undefined => {
    const iam = ctx.get('iam')
    if (iam === undefined || !iam.isSignedIn() || gateway.baseUrl === '') return undefined
    const tokens = iam.sessionTokens()
    const accessToken = tokens.accessToken ?? ''
    const authToken = tokens.authToken ?? ''
    if (accessToken === '' || authToken === '') return undefined
    const snapshot = iam.profileSnapshot()
    const userId = snapshot.accountId.trim() || userIdOfToken(accessToken)
    if (userId === '') return undefined
    return {
      baseUrl: gateway.baseUrl,
      accessToken,
      authToken,
      ...(tokens.refreshToken === undefined || tokens.refreshToken === ''
        ? {}
        : { refreshToken: tokens.refreshToken }),
      userId,
      ...(snapshot.username === '' && snapshot.displayName === ''
        ? {}
        : { username: snapshot.username || snapshot.displayName }),
      ...(snapshot.tenantId === undefined ? {} : { tenantId: snapshot.tenantId }),
      ...(snapshot.organizationId === undefined ? {} : { organizationId: snapshot.organizationId }),
      source: 'current',
    }
  }

  const signed: SignedAccessFeatures = {
    gateway: config => resolveSdkworkGateway(config, environmentFacts()),
    currentSession: gateway => Promise.resolve(currentSession(gateway)),
    login: input => port.login(input),
    listApplications: session => port.listApplications(session),
    exchange: (session, request) => port.exchange(session, request),
  }

  // The durable section the Host settings service serves under the entry id.
  // Reading and writing it keeps the remembered admin/operator logins in
  // `$DSH_HOME` (settings document + projection), never inside a repository.
  const scope = ctx.configForms.get<SdkworkAccessTokenSettings>(ACCESS_TOKEN_NAMESPACE)

  /** Projection path the Host published, with a readable fallback. */
  const projectionPath = (): string => decodeAccessTokenConfigPath(
    (globalThis as Partial<Record<typeof ACCESS_TOKEN_CONFIG_FILE_GLOBAL, unknown>>)[ACCESS_TOKEN_CONFIG_FILE_GLOBAL],
  ) || '<DSH_HOME>/sdkwork/access-token.config.json'

  const credentials: AccessTokenCredentialsFace = {
    read: (directory) => {
      const snapshot = scope.getSnapshot()
      if (snapshot.status !== 'ready' || snapshot.value === undefined) return undefined
      const account = findAccessTokenAccount(snapshot.value[ACCOUNTS_FIELD], directory)
      if (account === undefined) return undefined
      return {
        username: account.username,
        password: account.password,
        baseUrl: account.baseUrl,
        bootstrapAccessToken: account.bootstrapAccessToken,
        environment: account.environment,
      }
    },
    save: async (directory, values) => {
      const snapshot = scope.getSnapshot()
      if (snapshot.status !== 'ready' || snapshot.value === undefined) {
        throw new Error('the SDKWork access-token settings section is not ready')
      }
      const account = {
        project: directory,
        username: values.username.trim(),
        password: values.password,
        baseUrl: values.baseUrl,
        bootstrapAccessToken: values.bootstrapAccessToken,
        environment: values.environment,
        updatedAt: new Date().toISOString(),
      }
      const upsert = upsertAccessTokenAccount(snapshot.value[ACCOUNTS_FIELD], account)
      if (upsert.status === 'written') {
        const accepted = await scope.set(ACCOUNTS_FIELD, upsert.accounts)
        if (!accepted) throw new Error('the Host refused the remembered login write')
      }
      return { path: projectionPath(), status: upsert.status }
    },
    path: projectionPath,
  }

  const service: AccessTokenInitializerService = {
    open: (options) => {
      instance.actions.openDialog({
        directory: options.directory,
        displayTitle: options.displayTitle ?? basenameOf(options.directory),
      })
    },
  }
  ctx.provide('accessTokenInitializer', service)

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'sdkwork-access-token',
    locale: NS,
    store: uiStore,
    inject: (actions): AccessTokenDialogInjected => ({
      fileSystem,
      onClose: () => { actions.closeDialog() },
      signed,
      credentials,
    }),
  }, AccessTokenDialog))

  // The shared workspace context menu is the only right-click surface in a
  // composition without the SDKWork row-menus plugin; register the same verb
  // there so the action exists in both presentations. `ctx.inject` (not a
  // one-shot `ctx.get`) keeps this optional: the contribution installs whether
  // the menu service is already up or arrives later, and a composition without
  // it simply never contributes.
  ctx.inject(['contextMenus'], (menus) => {
    menus.effect(() => menus.contextMenus.register({
      id: 'sdkwork.initializeAccessToken',
      target: 'workspace',
      order: WORKSPACE_CONTEXT_MENU_ORDER,
      resolve: ({ path, displayTitle }) => isSdkworkProjectDirectory(path)
        ? [{
          id: 'sdkwork.initializeAccessToken',
          label: ctx.locale.bind(NS)('menu.initializeAccessToken'),
          run: () => { service.open({ directory: path, displayTitle }) },
        }]
        : [],
    }), 'ui-sdkwork-access-token: workspace context menu')
  })
}
