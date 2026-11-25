/**
 * Conversation publish executor: one `sdkwork-deploy/request` from the Host
 * tool, answered with the site facts the conversation card renders.
 *
 * The Host cannot publish on its own — the deploy API requires the signed-in
 * IAM session, which never leaves this browser client — so the request runs
 * here on the account already signed in to the app: resolve or create the
 * project's application, record its source, pack its build output, upload the
 * immutable artifact, cut the release and create the deployment through the
 * generated clients, then read the site back. A deployment the request does not
 * describe (a store review, an OTA drop) is expressible through the artifact
 * form and deployment kind/target overrides.
 */
import type {
  SdkworkDeployRequestEvent,
  SdkworkDeployFailureStage,
  SdkworkDeployResult,
  SdkworkDeploySite,
  SdkworkDeployKind,
  SdkworkDeployTarget,
} from '@deepseek-ai/dsh-tool-sdkwork-deploy/types'
import {
  createDeployApplicationPublisher,
  type AppDeploymentResponse,
  type ApplicationPublishResult,
} from '@sdkwork/deployments-app-sdk'
import {
  CARD_APP_KIND,
  createDeployAppPublishingService,
  type DeployAppPublishingService,
} from '@sdkwork/deployments-pc-console-publishing'
import type { DeployHost, DeployHostClients } from './deployHost.ts'
import { packScaffoldApp } from './hostArchive.ts'
import { createProjectApp } from './projectAppCreate.ts'
import { projectAppDraft, type ProjectAppDraft, type ProjectAppState } from './projectApp.ts'
import { maxBytesForPackageType } from './scaffoldPlatforms.ts'

/** The Host adapter plus the signed-in fact the executor gates on. */
export interface DeployConversationPorts {
  readonly host: DeployHost
  /** Whether an IAM user session is present (publishing needs one). */
  isSignedIn(): boolean
}

/** The `package_type` one console type card publishes by default. */
const PACKAGE_TYPE_BY_CARD: Readonly<Record<string, number>> = {
  'pc-web': 1,
  'h5': 1,
  'static-web': 1,
  'desktop': 2,
  'android': 2,
  'ios': 2,
  'harmonyos': 2,
  'mini-program': 3,
  'api-service': 4,
}

/** The default deployment plan one console type card uses. */
const DEPLOYMENT_BY_CARD: Readonly<Record<string, { deploymentKind: SdkworkDeployKind; deploymentTarget: SdkworkDeployTarget }>> = {
  'pc-web': { deploymentKind: 'ARTIFACT_RELEASE', deploymentTarget: 'WEB_NODE' },
  'h5': { deploymentKind: 'ARTIFACT_RELEASE', deploymentTarget: 'WEB_NODE' },
  'static-web': { deploymentKind: 'ARTIFACT_RELEASE', deploymentTarget: 'WEB_NODE' },
  'api-service': { deploymentKind: 'ARTIFACT_RELEASE', deploymentTarget: 'CONTAINER' },
  'desktop': { deploymentKind: 'OTA_DISTRIBUTION', deploymentTarget: 'OTA' },
  'android': { deploymentKind: 'STORE_SUBMISSION', deploymentTarget: 'ENTERPRISE' },
  'ios': { deploymentKind: 'STORE_SUBMISSION', deploymentTarget: 'TESTFLIGHT' },
  'harmonyos': { deploymentKind: 'STORE_SUBMISSION', deploymentTarget: 'HARMONYOS_STORE' },
  'mini-program': { deploymentKind: 'MINIPROGRAM_REVIEW', deploymentTarget: 'WECHAT_REVIEW' },
}

/** Lifecycle tiers a deployment may name. */
const ENVIRONMENTS = new Set(['development', 'test', 'staging', 'demo', 'production'])

/** Conventional build output directories, most specific first. */
const BUILD_OUTPUT_CANDIDATES = ['dist', 'build', 'out', '.output', 'public']

/**
 * The shipped brand's app-domain base. Used only when the platform exposes no
 * suffix catalog yet; the platform's own `appDomainSuffixes` always wins.
 */
const DEFAULT_APP_DOMAIN_SUFFIX = 'birdcoder.com'

/**
 * Publish one project from the conversation.
 * @param ports - Host adapter and sign-in fact.
 * @param request - relayed publish request.
 * @returns the published site, or the stage and detail that stopped the run.
 */
export async function publishFromConversation(
  ports: DeployConversationPorts,
  request: SdkworkDeployRequestEvent,
): Promise<SdkworkDeployResult> {
  let stage: SdkworkDeployFailureStage = 'resolveProject'
  try {
    if (!ports.isSignedIn()) {
      return failed('signedOut', 'SIGNED_OUT', 'Sign in to SDKWork in this app before publishing; the publish uses the account this app is already signed in to.')
    }
    const host = ports.host
    const publishedBy = host.readCurrentUser()?.displayName
    const directory = request.directory ?? host.readDefaultDirectory()
    if (directory === undefined || directory.trim() === '') {
      return failed('resolveProject', 'NO_PROJECT', 'No project directory was given and the Session has no working directory.')
    }
    const project = await host.readProjectApp(directory)
    if (!project.hasManifest) {
      return failed('resolveProject', 'NO_MANIFEST', `No agent.app.config.json was found under ${directory}.`)
    }
    const draft = projectAppDraft(project, basenameOf(directory))
    if (draft.cardId === undefined) {
      return failed('resolveApp', 'APP_TYPE_AMBIGUOUS', 'The manifest does not resolve to one application type; name the app type in the manifest before publishing.')
    }
    const clients = readClients(host)
    const publishing = createDeployAppPublishingService(clients)
    const appId = await resolveAppId(host, publishing, draft, project, directory)
    if (typeof appId !== 'string') return appId
    stage = 'resolveApp'
    const app = await clients.deployClient.app.retrieve(appId)
    stage = 'resolveBuildOutput'
    const buildRoot = await resolveBuildRoot(host, directory, project.sourceDirectory, request.buildOutput)
    if (buildRoot === undefined) {
      return failed(
        'resolveBuildOutput',
        'BUILD_OUTPUT_MISSING',
        `No build output was found for ${directory}; build the app first or pass buildOutput.`,
      )
    }
    stage = 'pack'
    const packageType = request.packageType ?? PACKAGE_TYPE_BY_CARD[draft.cardId] ?? 5
    const packed = await packScaffoldApp(host, buildRoot, maxBytesForPackageType(packageType))
    stage = 'uploadArchive'
    const environment = request.environment ?? environmentOf(project.profileId) ?? defaultEnvironmentOf(app)
    const targetKey = request.platformTarget ?? draft.cardId
    const targetId = await resolvePlatformTarget(publishing, appId, targetKey)
    const plan = DEPLOYMENT_BY_CARD[draft.cardId] ?? { deploymentKind: 'ARTIFACT_RELEASE', deploymentTarget: 'WEB_NODE' }
    const deploymentKind = request.deploymentKind ?? plan.deploymentKind
    const deploymentTarget = request.deploymentTarget ?? plan.deploymentTarget
    stage = 'createRelease'
    const version = await resolveReleaseVersion(clients, appId, request.version)
    if (version === undefined) {
      return failed('createRelease', 'INVALID_VERSION', `"${request.version ?? ''}" is not a usable semantic version.`)
    }
    stage = 'uploadArchive'
    const previousDeploymentId = await readServingDeploymentId(clients, appId)
    const publisher = createDeployApplicationPublisher(clients)
    const published = await publisher.publish({
      app: { kind: 'existing', appId },
      artifact: {
        file: packed.archive,
        packageType,
        fileName: `${app.slug}-${version}.zip`,
        contentType: 'application/zip',
        checksumSha256: packed.checksumSha256,
      },
      release: {
        platformTargetId: targetId,
        semanticVersion: version,
        ...(request.releaseNotes === undefined ? {} : { releaseNotes: { note: request.releaseNotes } }),
      },
      deployment: {
        platformTargetId: targetId,
        deploymentKind: deploymentKind as never,
        deploymentTarget: deploymentTarget as never,
        environment,
      },
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    })
    stage = 'readSite'
    const sourceRecorded = request.recordSource === false ? false : await recordSource(clients, appId, published)
    const deployment = await readDeployment(clients, appId, published)
    const site = await readSite(clients, {
      appId,
      environment,
      version,
      packageType,
      deploymentKind,
      deploymentTarget,
      published,
      deployment,
      ...(publishedBy === undefined ? {} : { publishedBy }),
      ...(previousDeploymentId === undefined ? {} : { previousDeploymentId }),
      sourceRecorded,
      ...(project.identity?.coverUrl === undefined ? {} : { coverUrl: project.identity.coverUrl }),
    })
    return { ok: true, status: 'published', site }
  } catch (error) {
    return failed(stage, codeOf(error), messageOf(error))
  }
}

/** Read the client pair, mapping an unconfigured gateway to an unavailable publish. */
function readClients(host: DeployHost): DeployHostClients {
  return host.readClients()
}

/** One reported failure. */
function failed(stage: SdkworkDeployFailureStage, code: string, message: string): SdkworkDeployResult {
  return { ok: false, status: 'failed', stage, code, message }
}

/** Resolve the project's application, creating and linking it when the manifest records none. */
async function resolveAppId(
  host: DeployHost,
  publishing: DeployAppPublishingService,
  draft: ProjectAppDraft,
  project: ProjectAppState,
  directory: string,
): Promise<string | SdkworkDeployResult> {
  if (project.linkedAppId !== undefined) return project.linkedAppId
  const appKind = CARD_APP_KIND[draft.cardId ?? ''] ?? 'PC_WEB'
  const outcome = await createProjectApp({
    createRecord: input => publishing.createAppRecord({
      name: input.name,
      appKind,
      ownerType: 'USER',
      ...(input.description === undefined ? {} : { description: input.description }),
    }),
    createTarget: async (appId, cardId) => {
      await publishing.createPlatformTargetForCard(appId, cardId)
    },
    writeLink: async (patch, app) => host.writeDeployLink(patch, directory, {
      name: draft.name,
      displayName: app.name,
      ...(draft.appKey === undefined ? {} : { appKey: draft.appKey }),
      ...(draft.cardId === undefined ? {} : { cardId: draft.cardId }),
      ...(draft.description === undefined ? {} : { description: draft.description }),
    }),
  }, { state: project, draft })
  if (outcome.status === 'already-linked') return outcome.appId
  if (!outcome.linked) {
    return failed('createApp', 'LINKAGE_WRITE_FAILED', 'The application was created but its project linkage could not be written; retry to record it.')
  }
  return outcome.app.id
}

/** Read the platform target the publish stages address, registering it when the app has none for its target key. */
async function resolvePlatformTarget(
  publishing: DeployAppPublishingService,
  appId: string,
  targetKey: string,
): Promise<string> {
  const targets = await publishing.listPlatformTargets(appId)
  const matched = targets.find(row => row.targetKey === targetKey)
  if (matched !== undefined) return matched.id
  const created = await publishing.createPlatformTargetForCard(appId, targetKey)
  return created.id
}

/**
 * Resolve the directory whose bytes are published: the request's build output,
 * else a conventional build output under the project's publish root, else the
 * root itself when it holds files.
 */
async function resolveBuildRoot(
  host: DeployHost,
  directory: string,
  sourceDirectory: string | undefined,
  requested: string | undefined,
): Promise<string | undefined> {
  if (requested !== undefined) {
    const explicit = joinPath(directory, requested)
    return await host.listDirectory(explicit) === undefined ? undefined : explicit
  }
  const root = sourceDirectory ?? directory
  for (const candidate of [...BUILD_OUTPUT_CANDIDATES.map(name => joinPath(root, name)), root]) {
    if (await host.listDirectory(candidate) !== undefined) return candidate
  }
  return undefined
}

/**
 * Resolve the release version: the requested one (bumped when a release already
 * holds it), or a patch bump over the newest release. Versions are immutable,
 * so the same version is never reused.
 */
async function resolveReleaseVersion(
  clients: DeployHostClients,
  appId: string,
  requested: string | undefined,
): Promise<string | undefined> {
  if (requested !== undefined && !isSemver(requested)) return undefined
  let existing: string[] = []
  try {
    const listing = await clients.deployClient.release.list(appId, { page: 1, pageSize: 50 })
    existing = listing.items
      .map(row => row.semanticVersion)
      .filter((value): value is string => typeof value === 'string' && isSemver(value))
  } catch {
    existing = []
  }
  const taken = new Set(existing)
  if (requested !== undefined) {
    let candidate = requested
    for (let attempts = 0; attempts < 50 && taken.has(candidate); attempts += 1) candidate = bumpPatch(candidate)
    return candidate
  }
  const latest = [...existing].sort(compareSemver).at(-1)
  let candidate = latest === undefined ? '0.1.0' : bumpPatch(latest)
  for (let attempts = 0; attempts < 50 && taken.has(candidate); attempts += 1) candidate = bumpPatch(candidate)
  return candidate
}

/** The deployment currently serving the app, as the rollback reference. */
async function readServingDeploymentId(clients: DeployHostClients, appId: string): Promise<string | undefined> {
  try {
    const listing = await clients.deployClient.deployment.list(appId, { page: 1, pageSize: 1 })
    return listing.items[0]?.id
  } catch {
    return undefined
  }
}

/** Record the published artifact as the application source; a failure is reported, not fatal. */
async function recordSource(
  clients: DeployHostClients,
  appId: string,
  published: ApplicationPublishResult,
): Promise<boolean> {
  try {
    await clients.deployClient.app.source.update(appId, {
      kind: 'ARCHIVE',
      archive: { artifactId: published.artifact.id },
    })
    return true
  } catch {
    return false
  }
}

/** Read the deployment back once, so the reported status is observed rather than assumed. */
async function readDeployment(
  clients: DeployHostClients,
  appId: string,
  published: ApplicationPublishResult,
): Promise<AppDeploymentResponse | undefined> {
  const created = published.deployment?.value
  if (created === undefined) return undefined
  try {
    return await clients.deployClient.deployment.retrieve(appId, created.id)
  } catch {
    return created
  }
}

/** Read the published site back: application state, hostname and deployment status. */
async function readSite(clients: DeployHostClients, facts: {
  appId: string
  environment: string
  version: string
  packageType: number
  deploymentKind: SdkworkDeployKind
  deploymentTarget: SdkworkDeployTarget
  published: ApplicationPublishResult
  deployment: AppDeploymentResponse | undefined
  publishedBy?: string
  previousDeploymentId?: string
  sourceRecorded: boolean
  coverUrl?: string
}): Promise<SdkworkDeploySite> {
  const app = await clients.deployClient.app.retrieve(facts.appId)
  const domains = await clients.deployClient.app.domains.list(facts.appId).catch(() => undefined)
  const preferred = domains?.items.find(row => row.environment === facts.environment && row.isCanonical)
    ?? domains?.items.find(row => row.environment === facts.environment)
    ?? domains?.items.find(row => row.isCanonical)
    ?? domains?.items[0]
  const fallbackDomain = defaultSiteHostname(app)
  const domain = preferred?.hostname ?? fallbackDomain
  return {
    appId: facts.appId,
    appName: app.name,
    appKind: app.appKind,
    environment: facts.environment,
    version: facts.version,
    releaseId: facts.published.release.id,
    ...(facts.deployment === undefined ? {} : {
      deploymentId: facts.deployment.id,
      deploymentStatus: facts.deployment.deploymentStatus,
      publishedAt: facts.deployment.createdAt,
    }),
    deploymentKind: facts.deploymentKind,
    deploymentTarget: facts.deploymentTarget,
    appStatus: app.appStatus,
    packageType: facts.packageType,
    sourceRecorded: facts.sourceRecorded,
    ...(facts.publishedBy === undefined ? {} : { publishedBy: facts.publishedBy }),
    ...(facts.previousDeploymentId === undefined ? {} : { previousDeploymentId: facts.previousDeploymentId }),
    ...(facts.coverUrl === undefined ? {} : { coverUrl: facts.coverUrl }),
    ...(domain === undefined ? {} : { domain, siteUrl: `https://${domain}/` }),
    ...(preferred === undefined && fallbackDomain !== undefined ? { domainDefault: true } : {}),
  }
}

/**
 * The platform's default hostname for an app, used before a canonical binding
 * is read: `<appDomainLabel>.app.<suffix>`, or `<label>.<brand suffix>` when the
 * platform exposed no suffix catalog yet.
 * @param app - application response fields that name the hostname.
 * @returns the default hostname, or undefined without a label.
 */
export function defaultSiteHostname(app: {
  appDomainLabel?: string
  slug?: string
  appDomainSuffixes?: readonly string[]
}): string | undefined {
  const label = (app.appDomainLabel ?? app.slug ?? '').trim()
  if (label === '') return undefined
  const suffix = app.appDomainSuffixes?.map(value => value.trim()).find(value => value !== '')
  return suffix === undefined ? `${label}.${DEFAULT_APP_DOMAIN_SUFFIX}` : `${label}.app.${suffix}`
}

/** The lifecycle tier a `<mode>.<environment>` profile names. */
function environmentOf(profileId: string | undefined): string | undefined {
  const environment = profileId?.split('.').at(-1)
  return environment !== undefined && ENVIRONMENTS.has(environment) ? environment : undefined
}

/** The tier the application itself defaults to. */
function defaultEnvironmentOf(app: { defaultEnvironment: string }): string {
  return app.defaultEnvironment.trim() === '' ? 'development' : app.defaultEnvironment
}

/** Join one child segment onto a directory path, tolerating either separator. */
function joinPath(parent: string, child: string): string {
  const separator = parent.includes('\\') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/u, '')}${separator}${child.replace(/^[\\/]+/u, '')}`
}

/** The project directory's own name, used as the created application's fallback name. */
function basenameOf(directory: string): string {
  const segments = directory.replace(/[\\/]+$/u, '').split(/[\\/]/u)
  return segments.at(-1) ?? directory
}

/** Whether a value is a `major.minor.patch` semantic version. */
export function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value.trim())
}

/** Order two semantic versions by their numeric parts. */
function compareSemver(left: string, right: string): number {
  const parts = (value: string): number[] => (value.split('-')[0] ?? '').split('.').map(part => Number(part))
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/** Bump the patch component of a semantic version. */
function bumpPatch(value: string): string {
  const [core = '0.0.0', suffix] = value.split('-', 2)
  const parts = core.split('.').map(part => Number(part))
  parts[2] = (parts[2] ?? 0) + 1
  return `${parts[0] ?? 0}.${parts[1] ?? 0}.${parts[2]}${suffix === undefined ? '' : `-${suffix}`}`
}

/** A stable machine code for a thrown failure. */
function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && code.trim() !== '') return code
    const name = (error as { name?: unknown }).name
    if (typeof name === 'string' && name.trim() !== '') return name
  }
  return 'STAGE_FAILED'
}

/** The failure detail of a thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'the publish failed without a message'
}
