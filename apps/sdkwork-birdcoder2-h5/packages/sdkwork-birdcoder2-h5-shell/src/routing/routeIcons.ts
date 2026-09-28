/**
 * Icon key to glyph resolution.
 *
 * A route contribution names an icon, not a component: the registry has to stay
 * serialisable for deep links and analytics, so the binding lives here — the
 * same split {@link resolveBirdCoder2H5RouteComponent} uses for screens.
 *
 * # Why a closed map rather than dynamic lookup
 *
 * `lucide-react` can be imported dynamically, but a name that resolves to
 * `undefined` at runtime would render an empty tab and say nothing about which
 * capability asked for it. An explicit map fails loudly at boot with the key
 * that is missing, and it keeps the bundle to the glyphs the shell actually
 * draws instead of pulling in the whole icon set.
 */
import { MessageSquare, MessagesSquare, Server, type LucideIcon } from 'lucide-react'

/**
 * Keys a contribution may name.
 *
 * Keys are kebab-case navigation concepts rather than the library's PascalCase
 * component names: a contribution should describe what the tab is for, and the
 * shell stays free to swap the glyph without touching every capability.
 */
const ROUTE_ICONS: Readonly<Record<string, LucideIcon>> = {
  'agent-chat': MessageSquare,
  'agent-sessions': MessagesSquare,
  'host-fleet': Server,
}

/**
 * Resolves an icon key to its glyph.
 *
 * # Errors
 *
 * Throws when a contribution names a key nothing registered, which is a wiring
 * mistake the shell must not swallow into a nameless tab.
 */
export function resolveBirdCoder2H5RouteIcon(iconKey: string): LucideIcon {
  const Icon = ROUTE_ICONS[iconKey]
  if (Icon === undefined) {
    throw new Error(
      `unknown BirdCoder2 H5 route icon "${iconKey}"; the shell's routeIcons must register it`,
    )
  }
  return Icon
}

/** The registered icon keys, for tests and diagnostics. */
export function listBirdCoder2H5RouteIconKeys(): readonly string[] {
  return Object.keys(ROUTE_ICONS)
}
