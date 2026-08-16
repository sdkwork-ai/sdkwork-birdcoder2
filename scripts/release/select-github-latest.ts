/** Select the highest public dsh GitHub Release by semantic-version precedence. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { compare, valid } from 'semver'

interface GitHubRelease {
  readonly id: number
  readonly tagName: string
  readonly draft: boolean
}

interface VersionedRelease extends GitHubRelease {
  readonly canonicalTag: boolean
  readonly version: string
}

/** The release metadata needed by the publication workflow. */
export interface GitHubLatestSelection {
  /** Database id of the release being published or retried. */
  readonly currentReleaseId: number
  /** Highest supported public tag after the current release is published. */
  readonly highestTag: string
  /** Whether publishing the current release may update GitHub's Latest pointer. */
  readonly makeLatest: boolean
}

function releaseRecords(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new TypeError('GitHub releases input must be an array')
  if (input.every(Array.isArray)) return input.flat()
  if (input.some(Array.isArray)) throw new TypeError('GitHub releases input must contain releases or paginated release arrays')
  return input
}

function githubRelease(value: unknown, index: number): GitHubRelease {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`GitHub release ${String(index)} must be an object`)
  }
  const record = value as Record<string, unknown>
  if (!Number.isSafeInteger(record.id) || (record.id as number) <= 0) {
    throw new TypeError(`GitHub release ${String(index)} must have a positive integer id`)
  }
  if (typeof record.tag_name !== 'string' || record.tag_name.length === 0) {
    throw new TypeError(`GitHub release ${String(index)} must have a tag_name`)
  }
  if (typeof record.draft !== 'boolean') {
    throw new TypeError(`GitHub release ${String(index)} must have a boolean draft field`)
  }
  return { id: record.id as number, tagName: record.tag_name, draft: record.draft }
}

/** Tag prefixes the repository has published releases under, current convention first. */
const RELEASE_TAG_PREFIXES = ['birdcoder-v', 'dsh-v'] as const

function versionedRelease(release: GitHubRelease): VersionedRelease | undefined {
  const canonicalTag = release.tagName.startsWith(RELEASE_TAG_PREFIXES[0])
  const prefixed = RELEASE_TAG_PREFIXES.find(prefix => release.tagName.startsWith(prefix))
  const rawVersion = prefixed !== undefined
    ? release.tagName.slice(prefixed.length)
    : /^v\d/.test(release.tagName)
      ? release.tagName.slice(1)
      : undefined
  if (rawVersion === undefined) return undefined
  const version = valid(rawVersion)
  if (version === null) throw new Error(`dsh GitHub Release tag is not valid semver: ${release.tagName}`)
  return { ...release, canonicalTag, version }
}

function higherRelease(left: VersionedRelease, right: VersionedRelease): VersionedRelease {
  const precedence = compare(left.version, right.version)
  if (precedence !== 0) return precedence > 0 ? left : right
  if (left.canonicalTag !== right.canonicalTag) return left.canonicalTag ? left : right
  return left.tagName.localeCompare(right.tagName) >= 0 ? left : right
}

/**
 * Select GitHub's expected Latest tag after publishing one release.
 *
 * Other drafts do not participate. The current release does because this
 * selection controls the PATCH that makes it public. Canonical `birdcoder-v`
 * tags win a precedence tie with legacy `dsh-v` and `v` tags.
 * @param input - one GitHub release array or the page arrays emitted by `gh api --paginate --slurp`.
 * @param currentTag - tag whose verified release is being published or retried.
 * @returns ids and metadata used by the release PATCH and Latest verification.
 */
export function selectGitHubLatest(input: unknown, currentTag: string): GitHubLatestSelection {
  const releases = releaseRecords(input).map(githubRelease)
  const currentMatches = releases.filter(release => release.tagName === currentTag)
  if (currentMatches.length !== 1) {
    throw new Error(`expected one GitHub Release for ${currentTag}, found ${String(currentMatches.length)}`)
  }
  const currentRelease = currentMatches[0]
  if (currentRelease === undefined) throw new Error(`GitHub Release for ${currentTag} disappeared during selection`)
  const current = versionedRelease(currentRelease)
  if (current === undefined) throw new Error(`current GitHub Release is not a dsh semver tag: ${currentTag}`)

  const candidates = releases.flatMap((release) => {
    if (release.draft && release.tagName !== currentTag) return []
    const versioned = versionedRelease(release)
    return versioned === undefined ? [] : [versioned]
  })
  const highest = candidates.reduce(higherRelease)
  return {
    currentReleaseId: current.id,
    highestTag: highest.tagName,
    makeLatest: highest.tagName === currentTag,
  }
}

function runCli(): void {
  const { values } = parseArgs({
    options: { 'current-tag': { type: 'string' } },
    allowPositionals: false,
    strict: true,
  })
  const currentTag = values['current-tag']
  if (currentTag === undefined) throw new Error('--current-tag is required')
  const input = JSON.parse(readFileSync(0, 'utf8')) as unknown
  process.stdout.write(`${JSON.stringify(selectGitHubLatest(input, currentTag))}\n`)
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  try {
    runCli()
  } catch (error) {
    console.error(`select-github-latest: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
