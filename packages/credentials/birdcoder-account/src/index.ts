/**
 * BirdCoder account plugin: keeps the relay provider configured from the
 * signed-in SDKWork IAM session.
 *
 * The desktop shell commits the IAM session to `<DSH_HOME>/iam/session.json`.
 * BirdCoder accepts that session's `authToken` as the relay API key, so this
 * plugin mirrors it into the `BIRDCODER_API_KEY` credential and declares the
 * relay profile through the settings seam while the user is signed in. The
 * Models page then reports the provider as configured, lists its models, and
 * request discovery and dispatch resolve the mirrored credential without the
 * user entering a key. A user-stored key always wins: this plugin reads the
 * reference before writing and leaves a value it did not write untouched.
 *
 * Sign-out removes the mirrored credential, the profile this plugin declared,
 * and the default-model switch it made, returning the composition to its
 * unconfigured state.
 *
 * @module @deepseek-ai/dsh-birdcoder-account
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { credentialRef, type CredentialRef } from '@deepseek-ai/dsh-credentials'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { dirname, join, resolve } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { BIRDCODER_CREDENTIAL_REF, BIRDCODER_PROVIDER, BIRDCODER_SESSION_CREDENTIAL_REF, BirdcoderAccountProvisioner } from './account.ts'
import type { DefaultModelPort } from './account.ts'
import {
  DEFAULT_CHANNEL_CODE,
  DEFAULT_RELAY_ORIGIN,
  FrontendModelCatalogLoader,
  frontendModelConfigEndpoint,
} from './model-catalog.ts'
import { RELAY_SESSION_FILENAME } from './session.ts'

export {
  BIRDCODER_CREDENTIAL_REF, BIRDCODER_PROVIDER, BIRDCODER_SESSION_CREDENTIAL_REF,
} from './account.ts'
export {
  FRONTEND_MODEL_CONFIG_PATH, FRONTEND_MODEL_CONFIG_SCHEMA_VERSION, frontendModelConfigEndpoint,
} from './model-catalog.ts'

export interface Config {
  /** Absolute mirrored-session path; defaults to `<DSH_HOME>/iam/session.json`. */
  sessionFile?: string
  /** Absolute path of the Host-readable relay credential projection; defaults beside the session. */
  relaySessionFile?: string
  /** Absolute ownership-marker path; defaults to the session directory's `birdcoder-account.json`. */
  stateFile?: string
  /** Credential reference the relay token is stored under. */
  credentialRef?: string
  /**
   * Credential reference a browser client mirrors the signed-in `authToken`
   * under. It is a session source, never the relay's own key, so a key the user
   * stores at {@link credentialRef} still wins.
   */
  sessionCredentialRef?: string
  /** Settings namespace owning the relay profile. */
  settingsNs?: string
  /** Session poll interval in milliseconds; `0` disables polling. */
  pollIntervalMs?: number
  /**
   * Whether to load the operator-authored front-end model configuration that
   * decides which catalog models the relay exposes. Defaults to `true`; the
   * loader falls back to the build-time seed whenever the document is not
   * reachable.
   */
  modelCatalogEnabled?: boolean
  /** Absolute app-api URL; defaults to the BirdCoder gateway's front-end configuration path. */
  modelCatalogEndpoint?: string
  /**
   * Absolute path of a pre-fetched configuration document. A shell that holds
   * the IAM tokens can project the document here so this Host child process
   * never needs the access token.
   */
  modelCatalogDocumentFile?: string
  /** Product surface whose exposure drives the relay catalog; defaults to `llm`. */
  modelCatalogChannelCode?: string
  /** Refresh interval for the remote document; `0` leaves only the start-up load. */
  modelCatalogPollIntervalMs?: number
  /** Per-request timeout for the remote document. */
  modelCatalogTimeoutMs?: number
  /** Explicit app-api auth token, for a deployment that provisions it. */
  modelCatalogAuthToken?: string
  /** Explicit app-api access token, for a deployment that provisions it. */
  modelCatalogAccessToken?: string
}

/** Runtime schema for {@link Config}. */
export const Config = z.object({
  sessionFile: z.string(),
  relaySessionFile: z.string(),
  stateFile: z.string(),
  credentialRef: z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/u).default(BIRDCODER_CREDENTIAL_REF),
  sessionCredentialRef: z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/u).default(BIRDCODER_SESSION_CREDENTIAL_REF),
  settingsNs: z.string().default('llm-pi-ai'),
  pollIntervalMs: z.natural().default(2000),
  modelCatalogEnabled: z.boolean().default(true),
  modelCatalogEndpoint: z.string().default(frontendModelConfigEndpoint(DEFAULT_RELAY_ORIGIN)),
  modelCatalogDocumentFile: z.string().default(''),
  modelCatalogChannelCode: z.string().default(DEFAULT_CHANNEL_CODE),
  modelCatalogPollIntervalMs: z.natural().default(300_000),
  modelCatalogTimeoutMs: z.natural().default(10_000),
  modelCatalogAuthToken: z.string().default(''),
  modelCatalogAccessToken: z.string().default(''),
})

export const name = 'birdcoder-account'
export const inject = ['credentials', 'settings']

/**
 * Adapt the default-model service to the provisioner's narrow port.
 * @param selection - stored selection value.
 * @returns the plain snapshot, with the branded effort as a string.
 */
function snapshot(selection: { provider: string; model: string; reasoningEffort?: unknown }): {
  provider: string
  model: string
  reasoningEffort?: string
} {
  const effort = typeof selection.reasoningEffort === 'string' ? selection.reasoningEffort : undefined
  return {
    provider: selection.provider,
    model: selection.model,
    ...effort === undefined ? {} : { reasoningEffort: effort },
  }
}

/**
 * Mount the relay provisioning controller.
 * @param ctx - Host context carrying the credential and optional settings seams.
 * @param config - resolved loader configuration.
 */
export function apply(ctx: Context, config: Config): void {
  // Validate the reference before any operation: an invalid name cannot be
  // stored, and failing at mount names the configuration field immediately.
  const ref: CredentialRef = credentialRef(config.credentialRef ?? BIRDCODER_CREDENTIAL_REF)
  const sessionCredentialRef = credentialRef(config.sessionCredentialRef ?? BIRDCODER_SESSION_CREDENTIAL_REF)
  const sessionFile = resolve(config.sessionFile ?? join(resolveDshHome(), 'iam', 'session.json'))
  const relaySessionFile = resolve(config.relaySessionFile ?? join(dirname(sessionFile), RELAY_SESSION_FILENAME))
  const stateFile = resolve(config.stateFile ?? join(dirname(sessionFile), 'birdcoder-account.json'))
  const defaults = ctx.get('agentDefaultModel')
  const llm = ctx.get('llm')
  const defaultModel: DefaultModelPort | undefined = defaults === undefined ? undefined : {
    current: () => snapshot(defaults.currentSelection()),
    save: async (next) => {
      await defaults.saveSelection({
        provider: next.provider,
        model: next.model,
        ...next.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: ReasoningEffortId(next.reasoningEffort) },
      })
    },
  }
  const provisioner = new BirdcoderAccountProvisioner({
    credentials: ctx.credentials,
    settings: ctx.settings,
    ...defaultModel === undefined ? {} : { defaultModel },
    ...llm === undefined ? {} : { listModels: provider => llm.listModels(provider) },
    log: (level, message, error) => {
      if (level === 'warn') ctx.logger.warn(message)
      else ctx.logger.info(message)
      if (error !== undefined) ctx.logger.warn(error)
    },
  }, {
    sessionFile,
    relaySessionFile,
    stateFile,
    credentialRef: ref,
    sessionCredentialRef,
    settingsNs: config.settingsNs ?? 'llm-pi-ai',
    pollIntervalMs: config.pollIntervalMs ?? 2000,
  })
  // The relay catalog is exposed by the operator's front-end model surface, not
  // by the build-time seed. This loader keeps the two in step while the session
  // can reach the app API or a shell-projected document exists; a failure keeps
  // the last known exposure and finally the seed.
  const catalogLoader = config.modelCatalogEnabled === false
    ? undefined
    : new FrontendModelCatalogLoader({
      provider: BIRDCODER_PROVIDER,
      channelCode: config.modelCatalogChannelCode ?? DEFAULT_CHANNEL_CODE,
      endpoint: config.modelCatalogEndpoint ?? '',
      documentFile: config.modelCatalogDocumentFile === undefined || config.modelCatalogDocumentFile === ''
        ? join(dirname(sessionFile), 'frontend-model-config.json')
        : config.modelCatalogDocumentFile,
      sessionFile,
      cacheFile: join(dirname(stateFile), 'frontend-model-config.cache.json'),
      pollIntervalMs: config.modelCatalogPollIntervalMs ?? 300_000,
      timeoutMs: config.modelCatalogTimeoutMs ?? 10_000,
      ...config.modelCatalogAuthToken === undefined || config.modelCatalogAuthToken === ''
        ? {}
        : { authToken: config.modelCatalogAuthToken },
      ...config.modelCatalogAccessToken === undefined || config.modelCatalogAccessToken === ''
        ? {}
        : { accessToken: config.modelCatalogAccessToken },
      applyPolicy: (catalogKeys, metadata) => {
        // No policy means "withdraw": the relay returns to its build-time seed.
        if (catalogKeys === undefined) {
          ctx.emit('llm/model-exposure-policy', BIRDCODER_PROVIDER, null)
          return
        }
        ctx.emit('llm/model-exposure-policy', BIRDCODER_PROVIDER, {
          catalogKeys,
          revision: metadata.revision,
          updatedAt: metadata.updatedAt,
          source: metadata.source,
        })
      },
      log: (level, message, error) => {
        if (level === 'warn') ctx.logger.warn(message)
        else ctx.logger.info(message)
        if (error !== undefined) ctx.logger.warn(error)
      },
    })
  ctx.effect(() => {
    provisioner.start()
    catalogLoader?.start()
    // The client writes its mirrored session through the credential plane, so a
    // committed write there is the moment a browser sign-in becomes usable: a
    // poll-only Host would leave the first request after login without a key.
    // The relay key this controller mirrors back is a different reference, so
    // its own write does not re-enter this handler.
    const off = ctx.on('credentials/reference-updated', (updated) => {
      if (updated === sessionCredentialRef) void provisioner.refresh()
    })
    // The adapter plugin can mount after the first exposure publication; replay
    // it when the provider topology settles so load order cannot lose it.
    const offAdapters = ctx.on('llm/adapters-updated', () => catalogLoader?.republish())
    return () => { off(); offAdapters(); provisioner.dispose(); catalogLoader?.dispose() }
  }, 'birdcoder-account: IAM session reconciliation')
}
