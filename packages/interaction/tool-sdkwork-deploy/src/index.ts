/**
 * Model-facing `sdkwork_deploy_app`: publish one SDKWork application from the
 * conversation.
 *
 * The Host owns request validation and result formatting only. Publishing needs
 * the signed-in IAM session, the project's build output through the Host
 * workspace bridge, and the generated deploy/drive clients — all of which live
 * in the BirdCoder browser client. The tool therefore relays a scoped
 * `sdkwork-deploy/request` waterfall to the connected client, which packs,
 * uploads, cuts the release and creates the deployment, then answers with the
 * site facts this tool returns.
 */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-error'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { ToolArgsError, ToolContextUnavailableError, defineTool } from '@deepseek-ai/dsh-tools'
import type { SdkworkDeployRequestEvent, SdkworkDeployResult, SdkworkDeploySite } from './types.ts'
import {
  DEPLOY_PACKAGE_TYPE_BY_FORM,
  SDKWORK_DEPLOY_ARTIFACT_FORMS,
  SDKWORK_DEPLOY_ENVIRONMENTS,
  SDKWORK_DEPLOY_KINDS,
  SDKWORK_DEPLOY_TARGETS,
} from './types.ts'

export type {
  SdkworkDeployArtifactForm,
  SdkworkDeployEnvironment,
  SdkworkDeployFailureStage,
  SdkworkDeployKind,
  SdkworkDeployRequestEvent,
  SdkworkDeployResult,
  SdkworkDeploySite,
  SdkworkDeployTarget,
} from './types.ts'

/** Stable Loader identity. */
export const name = 'tool-sdkwork-deploy'

/** Services used by the relay tool. */
export const inject = ['tools']

/** Upper bound of one relayed publish, matching the client's own publish budget. */
const PUBLISH_TIMEOUT_MS = 15 * 60_000

/** A relay failure with a stable, model-routable code. */
export class SdkworkDeployRelayError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'SdkworkDeployRelayError'
  }
}

/** No connected client can publish (for example a headless CLI Session). */
const NO_CLIENT = 'NO_CLIENT'

/**
 * Register `sdkwork_deploy_app` on the agent's tool set.
 * @param ctx - agent-scoped services.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'sdkwork_deploy_app',
    description: 'Publish one SDKWork application and return its live site. '
      + 'Use it after the project carries `agent.app.config.json` and its build output exists. '
      + 'The signed-in BirdCoder client resolves or creates the application, packs the build output, uploads the immutable artifact, '
      + 'records it as the application source, creates the release and creates the deployment; the result names the public URL, '
      + 'the deployment identity, the previous deployment (rollback reference) and the account that published. '
      + 'Defaults fit the manifest; artifactForm, deploymentKind, deploymentTarget and platformTarget override them for a deployment form '
      + 'the manifest does not describe. A failure reports the stage that stopped, so the next call changes one thing rather than retrying blindly.',
    parameters: {
      directory: {
        type: 'string',
        description: 'Project directory holding agent.app.config.json. Relative paths resolve against the Session working directory; omitted uses it.',
      },
      buildOutput: {
        type: 'string',
        description: 'Build output directory to publish, relative to the project root (for example `dist` or `apps/web/dist`). Omit to resolve the conventional output.',
      },
      environment: {
        type: 'string',
        enum: [...SDKWORK_DEPLOY_ENVIRONMENTS],
        description: 'Lifecycle tier to deploy to. Omit for the tier the manifest and Host profile select.',
      },
      version: {
        type: 'string',
        description: 'Semantic version for the release. Omit to derive the next patch over the application\'s existing releases.',
      },
      releaseNotes: {
        type: 'string',
        description: 'Short release note recorded with the release.',
      },
      artifactForm: {
        type: 'string',
        enum: [...SDKWORK_DEPLOY_ARTIFACT_FORMS],
        description: 'Artifact form registered on the platform. Omit to derive it from the application type.',
      },
      deploymentKind: {
        type: 'string',
        enum: [...SDKWORK_DEPLOY_KINDS],
        description: 'Deployment kind. Omit to derive it from the application type.',
      },
      deploymentTarget: {
        type: 'string',
        enum: [...SDKWORK_DEPLOY_TARGETS],
        description: 'Where the deployment lands. Omit to derive it from the application type.',
      },
      platformTarget: {
        type: 'string',
        description: 'Platform target key (for example `pc-web`, `h5`, `android`). Omit to match the application\'s target for its type.',
      },
      recordSource: {
        type: 'boolean',
        description: 'Record the uploaded artifact as the application source. Defaults to true; pass false for an artifact-only upload.',
      },
    },
    timeoutMs: PUBLISH_TIMEOUT_MS,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          status: { type: 'string', required: true },
          site: {
            type: 'object', additionalProperties: false,
            properties: {
              appId: { type: 'string', required: true },
              appName: { type: 'string', required: true },
              appKind: { type: 'string' },
              siteUrl: { type: 'string' },
              domain: { type: 'string' },
              domainDefault: { type: 'boolean' },
              coverUrl: { type: 'string' },
              environment: { type: 'string', required: true },
              version: { type: 'string' },
              releaseId: { type: 'string' },
              deploymentId: { type: 'string' },
              deploymentStatus: { type: 'string' },
              appStatus: { type: 'string' },
              publishedAt: { type: 'string' },
              packageType: { type: 'integer' },
              deploymentKind: { type: 'string' },
              deploymentTarget: { type: 'string' },
              publishedBy: { type: 'string' },
              sourceRecorded: { type: 'boolean' },
              previousDeploymentId: { type: 'string' },
            },
          },
          stage: { type: 'string' },
          code: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: describeResult(value) }],
      presentationMeta: (_args, value) => ({ deploy: value }),
    },
    async execute(args, exec) {
      if (exec.agent === undefined) {
        throw new ToolContextUnavailableError('sdkwork_deploy_app requires an agent Session')
      }
      exec.signal.throwIfAborted()
      const request = normalizeRequest(args, exec.agent)
      let result: SdkworkDeployResult
      try {
        result = await ctx.waterfall(
          scopeTarget(exec.agent, exec.agent),
          'sdkwork-deploy/request',
          { ...request, agent: exec.agent },
          () => Promise.reject(new SdkworkDeployRelayError(
            'No connected BirdCoder client can publish this application: the signed-in browser client owns the deploy session. '
            + 'Open this Session in the BirdCoder desktop or web app and call sdkwork_deploy_app again.',
            NO_CLIENT,
          )),
        )
      } catch (error) {
        if (exec.signal.aborted) {
          throw new SdkworkDeployRelayError('The publish request was cancelled before it finished', 'CANCELLED', { cause: error })
        }
        throw error instanceof HarnessError
          ? error
          : new SdkworkDeployRelayError(
            error instanceof Error ? error.message : 'the deploy client failed before publishing',
            'PUBLISH_FAILED',
            { cause: error },
          )
      }
      return result.ok
        ? { ok: true, status: 'published', ...(result.site === undefined ? {} : { site: result.site }) }
        : dropSite(result)
    },
  }))
}

/** Validated argument shape (the tool schema's inferred form). */
interface DeployArgs {
  directory?: string
  buildOutput?: string
  environment?: typeof SDKWORK_DEPLOY_ENVIRONMENTS[number]
  version?: string
  releaseNotes?: string
  artifactForm?: typeof SDKWORK_DEPLOY_ARTIFACT_FORMS[number]
  deploymentKind?: typeof SDKWORK_DEPLOY_KINDS[number]
  deploymentTarget?: typeof SDKWORK_DEPLOY_TARGETS[number]
  platformTarget?: string
  recordSource?: boolean
}

/** The tool's schema-inferred result shape, named for the text renderer. */
export interface DeployToolOutput {
  ok: boolean
  status: string
  site?: SdkworkDeploySite
  stage?: string
  code?: string
  message?: string
}

/**
 * Reject blank path and version arguments before the client sees them: an
 * empty string reads as "the working directory" downstream, which is a
 * different request than the caller made.
 */
function normalizeRequest(args: DeployArgs, agent: Agent): SdkworkDeployRequestEvent & { agent: Agent } {
  const clean = (value: string | undefined, field: string): string | undefined => {
    if (value === undefined) return undefined
    if (value.trim() === '') throw new ToolArgsError([`sdkwork_deploy_app requires a non-empty ${field}`])
    return value.trim()
  }
  const directory = clean(args.directory, 'directory')
  const buildOutput = clean(args.buildOutput, 'buildOutput')
  const version = clean(args.version, 'version')
  const releaseNotes = clean(args.releaseNotes, 'releaseNotes')
  const platformTarget = clean(args.platformTarget, 'platformTarget')
  return {
    agent,
    ...(directory === undefined ? {} : { directory }),
    ...(buildOutput === undefined ? {} : { buildOutput }),
    ...(args.environment === undefined ? {} : { environment: args.environment }),
    ...(version === undefined ? {} : { version }),
    ...(releaseNotes === undefined ? {} : { releaseNotes }),
    ...(args.artifactForm === undefined ? {} : { artifactForm: args.artifactForm }),
    ...(args.artifactForm === undefined ? {} : { packageType: DEPLOY_PACKAGE_TYPE_BY_FORM[args.artifactForm] }),
    ...(args.deploymentKind === undefined ? {} : { deploymentKind: args.deploymentKind }),
    ...(args.deploymentTarget === undefined ? {} : { deploymentTarget: args.deploymentTarget }),
    ...(platformTarget === undefined ? {} : { platformTarget }),
    ...(args.recordSource === undefined ? {} : { recordSource: args.recordSource }),
  }
}

/** Keep a failure's reported stage and detail. */
function dropSite(result: SdkworkDeployResult): DeployToolOutput {
  return {
    ok: false,
    status: 'failed',
    ...(result.stage === undefined ? {} : { stage: result.stage }),
    ...(result.code === undefined ? {} : { code: result.code }),
    ...(result.message === undefined ? {} : { message: result.message }),
  }
}

/** Model-facing text form of one published site or reported failure. */
export function describeResult(value: DeployToolOutput): string {
  if (!value.ok || value.site === undefined) {
    const stage = value.stage === undefined ? 'publish' : value.stage
    const code = value.code === undefined ? '' : ` (${value.code})`
    return `Publish failed at ${stage}${code}: ${value.message ?? 'no detail reported'}`
  }
  const { site } = value
  const lines = [
    `Published ${site.appName} (${site.appId}) to ${site.environment}`,
    ...(site.siteUrl === undefined ? [] : [`URL: ${site.siteUrl}`]),
    ...(site.version === undefined ? [] : [`Release: ${site.version}${site.releaseId === undefined ? '' : ` (${site.releaseId})`}`]),
    ...(site.deploymentId === undefined ? [] : [`Deployment: ${site.deploymentId}${site.deploymentStatus === undefined ? '' : ` — ${site.deploymentStatus}`}`]),
    ...(site.deploymentKind === undefined ? [] : [`Form: ${site.deploymentKind} to ${site.deploymentTarget ?? 'default target'}`]),
    ...(site.previousDeploymentId === undefined ? [] : [`Rollback reference: ${site.previousDeploymentId}`]),
    ...(site.sourceRecorded === undefined ? [] : [`Source recorded: ${site.sourceRecorded ? 'yes' : 'no'}`]),
    ...(site.publishedBy === undefined ? [] : [`Published by the signed-in account ${site.publishedBy}`]),
    ...(site.publishedAt === undefined ? [] : [`Published at: ${site.publishedAt}`]),
    'The site card is in the conversation; selecting it opens the site panel on the right.',
  ]
  return lines.join('\n')
}
