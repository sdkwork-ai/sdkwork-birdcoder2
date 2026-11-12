/**
 * Measure the paths the Windows installer creates while it unpacks an application payload.
 *
 * The directory installer unpacks into a staging directory beside the install root and only
 * promotes it once extraction succeeded (`installer-directories.nsh`). 7-Zip creates every
 * payload entry from a plain, non-`\\?\` path, so the deepest resource has to fit the whole
 * chain — install root, staging suffix, `resources\`, and the relative entry — below
 * `MAX_PATH`. A duplicated Office engine nested under `dsh-desktop-host/node_modules` pushed
 * that chain to 309 characters in 0.2.2-rc.2, and the published installer aborted with
 * "Error opening output file(s)" after creating 459 entries.
 */

/** Longest path the classic Win32 APIs open, excluding the terminating NUL. */
export const WINDOWS_PATH_LIMIT = 259

/**
 * Length of the install root the budget is measured against: the per-user default
 * `C:\Users\Charlesluo\AppData\Local\Programs\BirdCoder`, the root that failed on 0.2.2-rc.2.
 * A deeper root consumes the margin this constant leaves, which is why the packaged tree is
 * kept well below the limit rather than merely under it.
 */
export const WINDOWS_INSTALL_ROOT_LENGTH = 52

/**
 * Suffix the directory installer appends to the install root while the payload is unpacked.
 * @see `dshStageApplication` in `installer-directories.nsh` — the value is part of the budget.
 */
export const WINDOWS_STAGING_SUFFIX = '.new'

/** Separator between the staging directory and the entry below the application directory. */
const SEPARATOR = 1

/** Longest relative payload path an install may create below the application directory. */
export const WINDOWS_PAYLOAD_DEPTH_LIMIT = WINDOWS_PATH_LIMIT
  - WINDOWS_INSTALL_ROOT_LENGTH - WINDOWS_STAGING_SUFFIX.length - SEPARATOR

/** Overflow entries reported per failure; the rest are summarized by count. */
const REPORTED_OVERFLOW = 8

/**
 * Collect the payload entries an install can never create on Windows.
 * @param entries - Paths relative to the application directory the installer promotes.
 * @returns The longest entries that exceed the budget, longest first, plus the total count.
 */
export function windowsPayloadOverflow(entries: Iterable<string>): { paths: string[]; total: number } {
  const overflow: string[] = []
  let total = 0
  for (const entry of entries) {
    if (entry.length <= WINDOWS_PAYLOAD_DEPTH_LIMIT) continue
    total += 1
    overflow.push(entry)
  }
  overflow.sort((left, right) => right.length - left.length)
  return { paths: overflow.slice(0, REPORTED_OVERFLOW), total }
}
