/**
 * Surface-profile name folding for the Web page build.
 *
 * `apps/web/.env.<deployment-profile>.<environment>` is a Vite-format document:
 * the SDKWork materializer emits its public deployment values under
 * `VITE_SDKWORK_*`, the transport a bundle's `import.meta.env` consumes. The page
 * global `window.__DSH_SDKWORK_ENV__` is projected from the canonical
 * `SDKWORK_*` names instead (`@deepseek-ai/dsh-client-ui-sdkwork-env`), so a
 * materialized surface that never folds them bakes an empty deployment. This
 * module owns that fold, which lets one profile document serve both consumers.
 * @module
 */

/** Prefix a materialized surface profile carries its public values under. */
export const VITE_SDKWORK_PREFIX = 'VITE_SDKWORK_'

/** Prefix the canonical names the page projection reads. */
export const SDKWORK_PREFIX = 'SDKWORK_'

/**
 * Fold a surface profile's `VITE_SDKWORK_*` values onto their canonical
 * `SDKWORK_*` names.
 *
 * A value the profile already declares under the canonical name wins: the
 * explicit `DSH_WEB_SDKWORK_*` build channel and any hand-authored override keep
 * their precedence, and only an absent or blank canonical value is filled. Blank
 * transport values are skipped so an unset key never masks a later source. The
 * object is updated in place.
 * @param loaded - values read from the surface profile and its override layers.
 * @returns the same object, updated.
 */
export function foldSdkworkSurfaceIdentity(loaded: Record<string, string>): Record<string, string> {
  for (const [name, value] of Object.entries(loaded)) {
    if (!name.startsWith(VITE_SDKWORK_PREFIX) || value.trim() === '') continue
    const canonical = `${SDKWORK_PREFIX}${name.slice(VITE_SDKWORK_PREFIX.length)}`
    if ((loaded[canonical] ?? '').trim() === '') loaded[canonical] = value
  }
  return loaded
}
