/**
 * Build-time brand identity for the web shell.
 *
 * The document title and the installed PWA name ship with the build, so they
 * follow the brand manifest rather than a literal in the shell: an OEM
 * deployment selects its manifest with `DSH_BRAND` and both surfaces land on
 * that brand. `DSH_CLIENT_TITLE` remains an explicit override for local builds.
 *
 * @module apps/web/build-brand
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Brand key the web build ships as when `DSH_BRAND` names none. */
export const DEFAULT_BRAND_KEY = 'birdcoder'

/** Brand keys name one lower-case manifest file in `brands/`. */
const BRAND_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u

/** Longest display name a brand manifest may carry (the Host profile agrees). */
const MAX_DISPLAY_NAME_LENGTH = 64

/** Launch environment the build reads its identity from. */
export interface BuildBrandEnv {
  /** Brand manifest to ship as; absent means the shipped manifest. */
  readonly DSH_BRAND?: string
  /** Explicit title override for local builds. */
  readonly DSH_CLIENT_TITLE?: string
}

/**
 * Escape build-time text before placing it in the HTML title element.
 * @param value - raw text.
 * @returns the escaped text.
 */
export function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Resolve the title this build ships.
 *
 * A packaged or upstream build may carry no `brands/` directory at all, so an
 * absent default manifest keeps the checked-in document instead of failing the
 * build; an explicit `DSH_BRAND` that cannot be honoured is an error, because a
 * deployment that asked for one brand must never ship another.
 * @param env - build environment carrying the brand selection and title override.
 * @param brandDir - directory holding `<key>.json` brand manifests.
 * @returns the escaped title, or undefined when the checked-in document stands.
 * @throws Error when the selection is unusable or the manifest is malformed.
 */
export function resolveBuildTitle(env: BuildBrandEnv, brandDir: string): string | undefined {
  const override = env.DSH_CLIENT_TITLE?.trim()
  if (override !== undefined && override !== '') return escapeHtmlText(override)
  const declared = env.DSH_BRAND?.trim()
  const explicit = declared !== undefined && declared !== ''
  const key = explicit ? declared : DEFAULT_BRAND_KEY
  if (!BRAND_KEY_PATTERN.test(key)) {
    throw new Error(`apps/web: DSH_BRAND ${JSON.stringify(key)} is not a brand key (lower-case, digits, dashes)`)
  }
  const file = join(brandDir, `${key}.json`)
  if (!existsSync(file)) {
    if (explicit) throw new Error(`apps/web: DSH_BRAND selects ${JSON.stringify(key)} but ${file} does not exist`)
    return undefined
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { displayName?: unknown }
  const name = typeof parsed.displayName === 'string' ? parsed.displayName.trim() : ''
  if (name === '' || name.length > MAX_DISPLAY_NAME_LENGTH || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error(`apps/web: ${file} needs a displayName of 1-${MAX_DISPLAY_NAME_LENGTH} characters without control characters`)
  }
  return escapeHtmlText(name)
}

/**
 * Replace the document's title element with the build title.
 * @param html - the checked-in document.
 * @param title - already-escaped build title.
 * @returns the document with its title replaced.
 */
export function replaceDocumentTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/u, `<title>${title}</title>`)
}

/**
 * Retitle an install manifest for this build.
 *
 * The installed application name comes from the manifest, so an OEM brand must
 * land there too; every other field the shipped file carries stays untouched.
 * @param raw - manifest JSON text.
 * @param title - already-escaped build title.
 * @returns the manifest JSON text with its names replaced.
 */
export function retitleManifest(raw: string, title: string): string {
  const manifest = JSON.parse(raw) as Record<string, unknown>
  manifest.name = title
  manifest.short_name = title
  return `${JSON.stringify(manifest, null, 2)}\n`
}
