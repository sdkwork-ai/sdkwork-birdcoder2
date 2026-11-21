/**
 * The installation application the About surface renders, plus the decoder that
 * narrows the platform response before a component reads it.
 *
 * The values cross a wire boundary (the generated App API client returns JSON),
 * so they are re-validated here: a response missing a required field renders the
 * localized "incomplete" notice instead of a broken card. The vocabulary matches
 * `sdks/sdkwork-birdcoder2-app-sdk` and
 * `crates/sdkwork-birdcoder2-installation-service`.
 */

/** Release scope of the installation that issued the credential. */
export type AboutReleaseScope = 'TENANT' | 'ORGANIZATION' | 'USER'

/** SDKWork lifecycle environment the installation was registered for. */
export type AboutEnvironmentTier = 'development' | 'testing' | 'production'

/** Application runtime topology of the installation. */
export type AboutDeploymentMode = 'saas' | 'private' | 'local'

/** Product identity an installation freezes when it is created. */
export interface AboutProductFacts {
  /** Display name of the product. */
  name: string
  /** Vendor that publishes the product. */
  vendor: string
  /** Stable product key the deployment reports to platform collectors. */
  appKey: string
  /** Absolute URL of the product mark. */
  iconUrl: string
  /** Public product website. */
  websiteUrl: string
  /** Support entry point. */
  supportUrl: string
  /** Privacy policy. */
  privacyPolicyUrl: string
  /** Terms of service. */
  termsOfServiceUrl: string
}

/** Application identity the presented access token names. */
export interface AboutInstallationFacts {
  /** Deploy application anchor (the token's `app_id` claim). */
  appId: string
  /** Tenant the installation belongs to. */
  tenantId: string
  /** Resolved organization scope; `0` for a tenant-level installation. */
  organizationId: string
  /** Release scope the credential was issued for. */
  releaseScope: AboutReleaseScope
  /** Lifecycle environment the installation was registered for. */
  environment: AboutEnvironmentTier
  /** Application runtime topology. */
  deploymentMode: AboutDeploymentMode
  /** Product identity frozen at install time. */
  product: AboutProductFacts
}

/**
 * Product links shown before the platform answers, or when it cannot be reached.
 *
 * They mirror the shipped identity in `agent.app.config.json` and the Rust
 * service's default product profile, so an offline About page still offers the
 * real destinations instead of dead buttons.
 */
export const SHIPPED_PRODUCT_LINKS = {
  websiteUrl: 'https://sdkwork.com/apps/sdkwork-birdcoder',
  supportUrl: 'https://sdkwork.com/support',
  privacyPolicyUrl: 'https://sdkwork.com/privacy',
  termsOfServiceUrl: 'https://sdkwork.com/terms',
} as const

/** Vendor shown in the footer before the platform answers. */
export const SHIPPED_PRODUCT_VENDOR = 'SDKWork'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function releaseScope(value: unknown): AboutReleaseScope | undefined {
  return value === 'TENANT' || value === 'ORGANIZATION' || value === 'USER' ? value : undefined
}

function environmentTier(value: unknown): AboutEnvironmentTier | undefined {
  return value === 'development' || value === 'testing' || value === 'production' ? value : undefined
}

function deploymentMode(value: unknown): AboutDeploymentMode | undefined {
  return value === 'saas' || value === 'private' || value === 'local' ? value : undefined
}

/**
 * Narrow one platform response to the About payload.
 * @param value - decoded JSON returned by `installation.retrieve`.
 * @returns the complete payload, or undefined when a required fact is missing.
 */
export function decodeInstallationApplication(value: unknown): AboutInstallationFacts | undefined {
  if (!record(value)) return undefined
  const appId = text(value.appId)
  const tenantId = text(value.tenantId)
  const organizationId = stringValue(value.organizationId)
  const scope = releaseScope(value.releaseScope)
  const environment = environmentTier(value.environment)
  const mode = deploymentMode(value.deploymentMode)
  const product = readProduct(value.product)
  if (appId === undefined || tenantId === undefined || organizationId === undefined
    || scope === undefined || environment === undefined || mode === undefined || product === undefined) {
    return undefined
  }
  return { appId, tenantId, organizationId, releaseScope: scope, environment, deploymentMode: mode, product }
}

function readProduct(value: unknown): AboutProductFacts | undefined {
  if (!record(value)) return undefined
  const name = text(value.name)
  const vendor = text(value.vendor)
  const appKey = text(value.appKey)
  const iconUrl = stringValue(value.iconUrl)
  const websiteUrl = stringValue(value.websiteUrl)
  const supportUrl = stringValue(value.supportUrl)
  const privacyPolicyUrl = stringValue(value.privacyPolicyUrl)
  const termsOfServiceUrl = stringValue(value.termsOfServiceUrl)
  if (name === undefined || vendor === undefined || appKey === undefined || iconUrl === undefined
    || websiteUrl === undefined || supportUrl === undefined || privacyPolicyUrl === undefined
    || termsOfServiceUrl === undefined) {
    return undefined
  }
  return { name, vendor, appKey, iconUrl, websiteUrl, supportUrl, privacyPolicyUrl, termsOfServiceUrl }
}
