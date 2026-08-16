/** GitHub Latest selection across canonical and legacy dsh release tags. */

import { describe, expect, it } from 'vitest'
import { selectGitHubLatest } from './select-github-latest.ts'

interface ReleaseFixture {
  readonly id: number
  readonly tag_name: string
  readonly draft: boolean
}

function release(id: number, tagName: string, draft = false): ReleaseFixture {
  return { id, tag_name: tagName, draft }
}

describe('GitHub Latest selection', () => {
  it('selects the highest public semver across canonical and legacy tags', () => {
    expect(selectGitHubLatest([[
      release(11, 'birdcoder-v0.1.0-rc.11'),
      release(8, 'v0.1.0-rc.8'),
      release(100, 'python-v0.2.0'),
    ]], 'birdcoder-v0.1.0-rc.11')).toEqual({
      currentReleaseId: 11,
      highestTag: 'birdcoder-v0.1.0-rc.11',
      makeLatest: true,
    })
  })

  it('still ranks legacy dsh-v releases when they are the highest', () => {
    expect(selectGitHubLatest([
      release(9, 'dsh-v0.1.0-rc.9'),
      release(8, 'v0.1.0-rc.8'),
    ], 'dsh-v0.1.0-rc.9')).toEqual({
      currentReleaseId: 9,
      highestTag: 'dsh-v0.1.0-rc.9',
      makeLatest: true,
    })
  })

  it('keeps an older retried tag from replacing a newer Latest release', () => {
    expect(selectGitHubLatest([
      release(9, 'birdcoder-v0.1.0-rc.9'),
      release(11, 'birdcoder-v0.1.0-rc.11'),
    ], 'birdcoder-v0.1.0-rc.9')).toEqual({
      currentReleaseId: 9,
      highestTag: 'birdcoder-v0.1.0-rc.11',
      makeLatest: false,
    })
  })

  it('includes the current draft but excludes every other draft', () => {
    expect(selectGitHubLatest([
      release(11, 'birdcoder-v0.1.0-rc.11', true),
      release(12, 'birdcoder-v0.1.0-rc.12', true),
      release(10, 'birdcoder-v0.1.0-rc.10'),
    ], 'birdcoder-v0.1.0-rc.11')).toMatchObject({
      highestTag: 'birdcoder-v0.1.0-rc.11',
      makeLatest: true,
    })
  })

  it('ranks a stable version above prereleases with the same release numbers', () => {
    expect(selectGitHubLatest([
      release(20, 'birdcoder-v0.2.0'),
      release(99, 'birdcoder-v0.2.0-rc.99'),
    ], 'birdcoder-v0.2.0-rc.99')).toMatchObject({
      highestTag: 'birdcoder-v0.2.0',
      makeLatest: false,
    })
  })

  it('prefers the canonical prefix when legacy and canonical tags have equal precedence', () => {
    expect(selectGitHubLatest([
      release(80, 'dsh-v0.1.0-rc.8'),
      release(81, 'birdcoder-v0.1.0-rc.8'),
    ], 'birdcoder-v0.1.0-rc.8')).toMatchObject({
      highestTag: 'birdcoder-v0.1.0-rc.8',
      makeLatest: true,
    })
  })

  it('rejects missing, duplicate, or malformed dsh release records', () => {
    expect(() => { selectGitHubLatest([], 'birdcoder-v0.1.0') }).toThrow(/found 0/)
    expect(() => {
      selectGitHubLatest([release(1, 'birdcoder-v0.1.0'), release(2, 'birdcoder-v0.1.0')], 'birdcoder-v0.1.0')
    }).toThrow(/found 2/)
    expect(() => {
      selectGitHubLatest([release(1, 'birdcoder-vnot-semver')], 'birdcoder-vnot-semver')
    }).toThrow(/not valid semver/)
    expect(() => {
      selectGitHubLatest([{ id: 1, tag_name: 'birdcoder-v0.1.0', draft: 'false' }], 'birdcoder-v0.1.0')
    }).toThrow(/boolean draft/)
  })
})
