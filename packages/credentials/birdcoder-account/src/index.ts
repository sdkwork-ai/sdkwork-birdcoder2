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
import { BIRDCODER_CREDENTIAL_REF, BirdcoderAccountProvisioner } from './account.ts'
import type { DefaultModelPort } from './account.ts'

export { BIRDCODER_CREDENTIAL_REF, BIRDCODER_PROVIDER } from './account.ts'

export interface Config {
  /** Absolute mirrored-session path; defaults to `<DSH_HOME>/iam/session.json`. */
  sessionFile?: string
  /** Absolute ownership-marker path; defaults to the session directory's `birdcoder-account.json`. */
  stateFile?: string
  /** Credential reference the relay token is stored under. */
  credentialRef?: string
  /** Settings namespace owning the relay profile. */
  settingsNs?: string
  /** Session poll interval in milliseconds; `0` disables polling. */
  pollIntervalMs?: number
}

/** Runtime schema for {@link Config}. */
export const Config = z.object({
  sessionFile: z.string(),
  stateFile: z.string(),
  credentialRef: z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/u).default(BIRDCODER_CREDENTIAL_REF),
  settingsNs: z.string().default('llm-pi-ai'),
  pollIntervalMs: z.natural().default(2000),
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
  const sessionFile = resolve(config.sessionFile ?? join(resolveDshHome(), 'iam', 'session.json'))
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
    stateFile,
    credentialRef: ref,
    settingsNs: config.settingsNs ?? 'llm-pi-ai',
    pollIntervalMs: config.pollIntervalMs ?? 2000,
  })
  ctx.effect(() => {
    provisioner.start()
    return () => { provisioner.dispose() }
  }, 'birdcoder-account: IAM session reconciliation')
}
