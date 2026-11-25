/**
 * Catalog-to-Host installation lookup for the SDKWork Plugins marketplace.
 *
 * The catalog is served by SDKWork Plugins; whether a catalog record is
 * installed belongs to the local Host profile. This module joins the two
 * without a second persisted state: a record matches an installed bundle by its
 * registry package name or by the Git source the profile saved for it.
 * @module @deepseek-ai/dsh-client-ui-sdkwork-markets/pluginInstallation
 */
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import type { PluginRecord } from '@sdkwork/plugins-app-sdk'

/** One install target as the SDKWork catalog record carries it. */
export interface CatalogInstallTarget {
  readonly kind: string
  readonly spec: string
  readonly packageName?: string | null
  readonly packageVersion?: string | null
  readonly isDefault?: boolean
}

/** A catalog record with the installation facts the generated SDK may not type yet. */
type CatalogRecord = PluginRecord & {
  readonly installTarget?: CatalogInstallTarget | null
  readonly installTargets?: readonly CatalogInstallTarget[]
  readonly npmPackage?: string | null
  readonly repositoryUrl?: string | null
  readonly registryVersion?: string | null
  readonly marketplaceMetadata?: unknown
}

/** What the local profile says about one installed catalog record. */
export interface MarketplaceInstallation {
  readonly status: 'installed' | 'update-available'
  /** Name of the installed profile dependency, the key update and remove take. */
  readonly packageName: string
  /** Installed package version, when its manifest declares one. */
  readonly installedVersion?: string
  /** Version the catalog offers, when it declares one. */
  readonly version?: string
}

/** The fields the catalog projection may add before the SDK types them. */
interface MarketplaceMetadataFacts {
  npmPackage?: unknown
  repositoryUrl?: unknown
  version?: unknown
}

/** The catalog target installation should use: the default one, else the first listed. */
export function installTargetOf(plugin: PluginRecord): CatalogInstallTarget | undefined {
  const record = plugin as CatalogRecord
  if (record.installTarget !== undefined && record.installTarget !== null) return record.installTarget
  const targets = record.installTargets
  if (!Array.isArray(targets) || targets.length === 0) return undefined
  return targets.find(target =>  target.isDefault) ?? targets[0]
}

function metadataFacts(plugin: PluginRecord): MarketplaceMetadataFacts {
  const value = (plugin as CatalogRecord).marketplaceMetadata
  return typeof value === 'object' && value !== null ? value : {}
}

/** The registry package name the catalog names, from the record or its imported metadata. */
export function catalogPackageName(plugin: PluginRecord): string | undefined {
  const record = plugin as CatalogRecord
  if (typeof record.npmPackage === 'string' && record.npmPackage !== '') return record.npmPackage
  const target = installTargetOf(plugin)
  if (typeof target?.packageName === 'string' && target.packageName !== '') return target.packageName
  const facts = metadataFacts(plugin)
  return typeof facts.npmPackage === 'string' && facts.npmPackage !== '' ? facts.npmPackage : undefined
}

/** The catalog version the record advertises. */
export function catalogVersion(plugin: PluginRecord): string | undefined {
  const record = plugin as CatalogRecord
  if (typeof record.registryVersion === 'string' && record.registryVersion !== '') return record.registryVersion
  const target = installTargetOf(plugin)
  if (typeof target?.packageVersion === 'string' && target.packageVersion !== '') return target.packageVersion
  const facts = metadataFacts(plugin)
  return typeof facts.version === 'string' && facts.version !== '' ? facts.version : undefined
}

/**
 * Render the origin an installed Git dependency was saved from: the lower-case
 * host and repository path without transport, user information, or `.git`.
 * @param source - an install spec as the profile records it.
 * @returns the origin, or undefined when the source is not a Git address.
 */
export function gitOriginOf(source: string | undefined): string | undefined {
  if (typeof source !== 'string') return undefined
  const base = source.split('#')[0]?.replace(/^git\+/iu, '') ?? ''
  const shorthand = /^(github|gitlab|bitbucket|gist):(.*)$/iu.exec(base)
  if (shorthand !== null) {
    const host = shorthand[1].toLowerCase() === 'gist' ? 'gist.github.com' : `${shorthand[1].toLowerCase()}.com`
    return `${host}/${shorthand[2].replace(/\/+$/u, '').replace(/\.git$/iu, '')}`.toLowerCase()
  }
  if (!/^(?:https?:\/\/|git@)/iu.test(base)) return undefined
  return base
    .replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '')
    .replace(/^[^@/]+@/u, '')
    .replace(/^([^/:]+):(?!\d)/u, '$1/')
    .replace(/\/+$/u, '')
    .replace(/\.git$/iu, '')
    .toLowerCase()
}

function repositoryOrigin(plugin: PluginRecord): string | undefined {
  const record = plugin as CatalogRecord
  const repository = typeof record.repositoryUrl === 'string' ? record.repositoryUrl : undefined
  const facts = metadataFacts(plugin)
  const fromFacts = typeof facts.repositoryUrl === 'string' ? facts.repositoryUrl : undefined
  return gitOriginOf(repository ?? fromFacts)
}

function installedBundle(plugin: PluginRecord, bundles: readonly BundleInfo[]): BundleInfo | undefined {
  const packageName = catalogPackageName(plugin)
  if (packageName !== undefined) {
    const byName = bundles.find(bundle => bundle.installed && bundle.name === packageName)
    if (byName !== undefined) return byName
  }
  const origin = repositoryOrigin(plugin)
  if (origin === undefined) return undefined
  return bundles.find(bundle => bundle.installed
    && bundle.removable
    && gitOriginOf(bundle.source) === origin)
}

/** Whether the catalog version is a semver release the Host can update toward. */
function newerRelease(installed: string | undefined, offered: string | undefined): string | undefined {
  if (installed === undefined || offered === undefined) return undefined
  const parse = (value: string): [number, number, number] | undefined => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(value)
    return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])]
  }
  const left = parse(installed)
  const right = parse(offered)
  if (left === undefined || right === undefined) return undefined
  for (let index = 0; index < 3; index += 1) {
    if (right[index] > left[index]) return offered
    if (right[index] < left[index]) return undefined
  }
  return undefined
}

/**
 * Join one catalog record with the profile's installed bundles.
 * @param plugin - the catalog record.
 * @param bundles - the Host's bundle roster.
 * @returns the installed state, or undefined when the profile does not hold it.
 */
export function findInstallation(
  plugin: PluginRecord,
  bundles: readonly BundleInfo[],
): MarketplaceInstallation | undefined {
  const bundle = installedBundle(plugin, bundles)
  if (bundle === undefined) return undefined
  const installedVersion = bundle.version
  const version = catalogVersion(plugin)
  const updatable = bundle.update === 'registry' ? newerRelease(installedVersion, version) : undefined
  return {
    status: updatable === undefined ? 'installed' : 'update-available',
    packageName: bundle.name,
    ...(installedVersion === undefined ? {} : { installedVersion }),
    ...(version === undefined ? {} : { version }),
  }
}
