/**
 * The BirdCoder2 H5 route registry.
 *
 * Authority: `APP_CLIENT_ARCHITECTURE_ALIGNMENT_SPEC.md` section 7 — a route
 * identity is `<surface>.<domain>.<capability>.<screen>`, four segments, and the
 * registry lives in the **core** package, not in the shell and not in a
 * capability package. Physical paths may differ from identity: the router binds
 * `path`, while the identity is what other roots (deep links, analytics, a future
 * mini-program root) match on.
 *
 * Capability packages publish contributions; core validates and freezes them.
 * Validation is deliberately strict, because a malformed identity stays invisible
 * until a deep link silently stops resolving.
 */

/** The surface segment every BirdCoder2 H5 route carries. */
export const BIRDCODER2_H5_SURFACE = 'app' as const

/** How a route is gated before it renders. */
export type BirdCoder2H5RouteAuth = 'required' | 'optional' | 'public'

/** Where a route appears in the mobile shell. */
export type BirdCoder2H5RoutePresentation = 'screen' | 'tab'

/** One route a capability package contributes. */
export interface BirdCoder2H5RouteContribution {
  /** Route identity: `<surface>.<domain>.<capability>.<screen>`. */
  readonly id: string
  /** Physical path the router binds, for example `/hosts`. */
  readonly path: string
  /** Registered component key, resolved by the shell's route component map. */
  readonly component: string
  readonly auth: BirdCoder2H5RouteAuth
  /** `tab` routes appear in the bottom navigation; `screen` routes do not. */
  readonly presentation?: BirdCoder2H5RoutePresentation
  /** i18n key for the screen title. */
  readonly titleKey?: string
  /** i18n key for the navigation label; required when `presentation` is `tab`. */
  readonly tabLabelKey?: string
  /**
   * Registered icon key for the navigation entry; required when `presentation`
   * is `tab`.
   *
   * A key rather than a component: the registry has to stay serialisable for
   * deep links and analytics, so the name travels and the shell resolves it to
   * a glyph. That is the same split `component` uses for screens.
   */
  readonly iconKey?: string
}

/**
 * A validated contribution, tagged with the package that owns it.
 *
 * The owner is carried so a composition error names the package to fix rather
 * than the registry that rejected it.
 */
export interface BirdCoder2H5RouteDefinition extends BirdCoder2H5RouteContribution {
  readonly capabilityPackage: string
}

/** The frozen registry the shell and the router read. */
export interface BirdCoder2H5RouteRegistry {
  readonly routes: readonly BirdCoder2H5RouteDefinition[]
  /** Tab routes in contribution order. */
  readonly tabs: readonly BirdCoder2H5RouteDefinition[]
  /** Resolves a route identity, or `undefined` when nothing declares it. */
  findById(id: string): BirdCoder2H5RouteDefinition | undefined
  /** Resolves the route bound to a physical path, or `undefined`. */
  findByPath(path: string): BirdCoder2H5RouteDefinition | undefined
}

/** Thrown when a contribution set cannot form a consistent registry. */
export class BirdCoder2RouteRegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BirdCoder2RouteRegistryError'
  }
}

const ROUTE_ID_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*){3}$/u

/**
 * Builds a route identity from its four segments.
 *
 * Prefer this over writing the dotted string by hand: it is the one place the
 * segment order is expressed, and it keeps the surface segment from drifting.
 */
export function routeIdOf(
  domain: string,
  capability: string,
  screen: string,
  surface: string = BIRDCODER2_H5_SURFACE,
): string {
  return [surface, domain, capability, screen].join('.')
}

function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`
  const collapsed = withLeadingSlash.replace(/\/{2,}/gu, '/')
  return collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0
}

/**
 * Validates contributions and freezes a registry.
 *
 * # Errors
 *
 * Returns a {@link BirdCoder2RouteRegistryError} for a malformed identity, a
 * blank path or component, a duplicated identity, two contributions claiming one
 * path, or a tab without a navigation label or icon.
 */
export function createRouteRegistry(
  contributions: readonly (readonly [string, readonly BirdCoder2H5RouteContribution[]])[],
): BirdCoder2H5RouteRegistry {
  const routes: BirdCoder2H5RouteDefinition[] = []
  const byId = new Map<string, BirdCoder2H5RouteDefinition>()
  const byPath = new Map<string, BirdCoder2H5RouteDefinition>()

  for (const [capabilityPackage, packageContributions] of contributions) {
    for (const contribution of packageContributions) {
      if (!ROUTE_ID_PATTERN.test(contribution.id)) {
        throw new BirdCoder2RouteRegistryError(
          `${capabilityPackage}: route id "${contribution.id}" must be '<surface>.<domain>.<capability>.<screen>'`,
        )
      }
      if (!contribution.id.startsWith(`${BIRDCODER2_H5_SURFACE}.`)) {
        throw new BirdCoder2RouteRegistryError(
          `${capabilityPackage}: route id "${contribution.id}" must start with "${BIRDCODER2_H5_SURFACE}."`,
        )
      }
      if (isBlank(contribution.path)) {
        throw new BirdCoder2RouteRegistryError(
          `${capabilityPackage}: route "${contribution.id}" has a blank path`,
        )
      }
      if (isBlank(contribution.component)) {
        throw new BirdCoder2RouteRegistryError(
          `${capabilityPackage}: route "${contribution.id}" has a blank component`,
        )
      }
      if (contribution.presentation === 'tab' && isBlank(contribution.tabLabelKey)) {
        throw new BirdCoder2RouteRegistryError(
          `${capabilityPackage}: tab route "${contribution.id}" must declare tabLabelKey`,
        )
      }
      if (contribution.presentation === 'tab' && isBlank(contribution.iconKey)) {
        throw new BirdCoder2RouteRegistryError(
          `${capabilityPackage}: tab route "${contribution.id}" must declare iconKey`,
        )
      }

      const existingId = byId.get(contribution.id)
      if (existingId !== undefined) {
        throw new BirdCoder2RouteRegistryError(
          `route id "${contribution.id}" is declared by both ${existingId.capabilityPackage} and ${capabilityPackage}`,
        )
      }

      const normalizedPath = normalizePath(contribution.path)
      const existingPath = byPath.get(normalizedPath)
      if (existingPath !== undefined) {
        throw new BirdCoder2RouteRegistryError(
          `path "${normalizedPath}" is claimed by both ${existingPath.id} and ${contribution.id}`,
        )
      }

      const definition: BirdCoder2H5RouteDefinition = {
        ...contribution,
        path: normalizedPath,
        capabilityPackage,
      }
      routes.push(definition)
      byId.set(definition.id, definition)
      byPath.set(normalizedPath, definition)
    }
  }

  return {
    routes,
    tabs: routes.filter(route => route.presentation === 'tab'),
    findById: (id: string) => byId.get(id),
    findByPath: (path: string) => byPath.get(normalizePath(path)),
  }
}
