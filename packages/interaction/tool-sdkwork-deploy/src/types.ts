/**
 * Cross-package vocabulary of the deploy-from-conversation bridge.
 *
 * The Host tool only validates the request and relays it: publishing needs the
 * signed-in IAM session and the generated deploy/drive clients, which live in
 * the BirdCoder browser client. `sdkwork-deploy/request` is a scoped waterfall
 * forwarded to that client (see `@deepseek-ai/dsh-api-remotes`), so the client
 * performs the authenticated publish and returns these facts.
 */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Scoped } from '@deepseek-ai/dsh-scope'

/** Lifecycle tiers a publish may target. */
export const SDKWORK_DEPLOY_ENVIRONMENTS = [
  'development',
  'test',
  'staging',
  'demo',
  'production',
] as const

/** One supported lifecycle tier. */
export type SdkworkDeployEnvironment = typeof SDKWORK_DEPLOY_ENVIRONMENTS[number]

/**
 * Artifact forms the deploy platform registers, with the `package_type` each
 * one stores. The names are the publishing console's own vocabulary so the
 * model can choose a form without knowing numeric wire codes.
 */
export const SDKWORK_DEPLOY_ARTIFACT_FORMS = [
  'static',
  'native',
  'mini-program',
  'server-bundle',
  'generic',
] as const

/** One artifact form. */
export type SdkworkDeployArtifactForm = typeof SDKWORK_DEPLOY_ARTIFACT_FORMS[number]

/** `package_type` behind each artifact form. */
export const DEPLOY_PACKAGE_TYPE_BY_FORM: Readonly<Record<SdkworkDeployArtifactForm, number>> = {
  'static': 1,
  'native': 2,
  'mini-program': 3,
  'server-bundle': 4,
  'generic': 5,
}

/**
 * Deployment kinds the platform accepts. Mirrors
 * `DeploymentKind` in `@sdkwork/deployments-app-sdk`; a value the platform
 * rejects is reported as the failed `createDeployment` stage.
 */
export const SDKWORK_DEPLOY_KINDS = [
  'ARTIFACT_RELEASE',
  'SITE_CONFIG',
  'TLS_CONFIG',
  'MINIPROGRAM_REVIEW',
  'STORE_SUBMISSION',
  'OTA_DISTRIBUTION',
  'ENTERPRISE_DISTRIBUTION',
  'CONTAINER_ROLLOUT',
] as const

/** One deployment kind. */
export type SdkworkDeployKind = typeof SDKWORK_DEPLOY_KINDS[number]

/**
 * Deployment targets the platform accepts. Mirrors `DeploymentTarget` in
 * `@sdkwork/deployments-app-sdk`.
 */
export const SDKWORK_DEPLOY_TARGETS = [
  'WEB_NODE',
  'CONTAINER',
  'WECHAT_REVIEW',
  'DOUYIN_REVIEW',
  'APP_STORE_CONNECT',
  'TESTFLIGHT',
  'OTA',
  'ENTERPRISE',
  'HARMONYOS_STORE',
] as const

/** One deployment target. */
export type SdkworkDeployTarget = typeof SDKWORK_DEPLOY_TARGETS[number]

/** The publish request the Host relays to the connected client. */
export interface SdkworkDeployRequestEvent {
  /** Project directory holding `agent.app.config.json`; absent uses the Session cwd. */
  directory?: string
  /** Build output directory relative to the project root; absent resolves the conventional output. */
  buildOutput?: string
  /** Lifecycle tier; absent uses the manifest's deployment profile tier. */
  environment?: SdkworkDeployEnvironment
  /** Semantic version override; absent derives it from the manifest and the app's releases. */
  version?: string
  /** Release notes recorded with the release. */
  releaseNotes?: string
  /** Artifact form override; absent derives it from the manifest's application type. */
  artifactForm?: SdkworkDeployArtifactForm
  /** `package_type` the Host derived from {@link artifactForm}; the client never re-derives the wire code. */
  packageType?: number
  /** Deployment kind override; absent derives it from the application type. */
  deploymentKind?: SdkworkDeployKind
  /** Deployment target override; absent derives it from the application type. */
  deploymentTarget?: SdkworkDeployTarget
  /** Platform target key override; absent matches the app's target for its type card. */
  platformTarget?: string
  /** Record the uploaded artifact as the application's source; defaults to true. */
  recordSource?: boolean
  /** Agent identity projected to the corresponding Client Context in transit. */
  agent?: Agent
  /** Cancellation lifetime of the pending request. */
  signal?: AbortSignal
}

/**
 * One published site, as the conversation card and the right-sidebar panel
 * present it. Field names are the panel's own vocabulary (`siteUrl`,
 * `environment`, …), not a restatement of the generated SDK response.
 */
export interface SdkworkDeploySite {
  /** `deploy_app` identity. */
  readonly appId: string
  /** Display name the card shows. */
  readonly appName: string
  /** Console application kind (`PC_WEB`, `H5_WEB`, …). */
  readonly appKind?: string
  /** Canonical public URL, when the platform assigned a hostname. */
  readonly siteUrl?: string
  /** Canonical hostname behind {@link siteUrl}. */
  readonly domain?: string
  /** The domain is the platform's default pattern; no canonical binding was read yet. */
  readonly domainDefault?: boolean
  /** Product cover image (manifest preview, else screenshot, else icon). */
  readonly coverUrl?: string
  /** Lifecycle tier the deployment targets. */
  readonly environment: string
  /** Published semantic version. */
  readonly version?: string
  /** Release identity. */
  readonly releaseId?: string
  /** Deployment identity. */
  readonly deploymentId?: string
  /** Platform deployment status at the moment the publish returned. */
  readonly deploymentStatus?: string
  /** `app_status` at the moment the publish returned. */
  readonly appStatus?: string
  /** ISO timestamp the deployment was created. */
  readonly publishedAt?: string
  /** Package type the artifact was registered under (`1` static, `2` native, `3` mini program, `4` server bundle, `5` generic). */
  readonly packageType?: number
  /** Deployment kind this publish used, when it created a deployment. */
  readonly deploymentKind?: string
  /** Deployment target this publish used, when it created a deployment. */
  readonly deploymentTarget?: string
  /** Display name of the signed-in account that ran the publish. */
  readonly publishedBy?: string
  /** Whether the uploaded artifact was recorded as the application's source. */
  readonly sourceRecorded?: boolean
  /** The deployment that was serving before this publish, as the rollback reference. */
  readonly previousDeploymentId?: string
}

/** Stage that failed, mirroring the publisher's stage names. */
export type SdkworkDeployFailureStage =
  | 'resolveProject'
  | 'resolveApp'
  | 'createApp'
  | 'resolveBuildOutput'
  | 'pack'
  | 'uploadArchive'
  | 'registerArtifact'
  | 'createRelease'
  | 'createDeployment'
  | 'readSite'
  | 'signedOut'
  | 'unavailable'

/**
 * The client's answer to one publish request. `ok: false` is a reported
 * publish failure, not a transport failure: the Host still returns it so the
 * card and the model both see which stage stopped.
 */
export interface SdkworkDeployResult {
  readonly ok: boolean
  /** `published` only after the deployment response was read back. */
  readonly status: 'published' | 'failed'
  /** Published site facts; present when `ok`. */
  readonly site?: SdkworkDeploySite
  /** Failed stage; present when not `ok`. */
  readonly stage?: SdkworkDeployFailureStage
  /** Stable machine code for the failure. */
  readonly code?: string
  /** Human-readable failure detail. */
  readonly message?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Publish one SDKWork application from its project directory, through the
     * connected Client that owns the IAM session and the deploy clients.
     * @param request - project directory, build output, tier and version.
     * @param next - delegate to the Host fallback when no Client answers.
     * @mode waterfall
     */
    'sdkwork-deploy/request'(
      this: Scoped<Agent>,
      request: SdkworkDeployRequestEvent,
      next: () => Promise<SdkworkDeployResult>,
    ): Promise<SdkworkDeployResult>
  }
}
