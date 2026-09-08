/**
 * sdkwork-git capability against the real git CLI: fixture repositories are
 * created in temp directories with explicit env (no user identity, no network)
 * so every scenario stays hermetic.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SdkworkGitError } from '../src/errors.ts'
import { SdkworkGit } from '../src/index.ts'

const run = promisify(execFile)
const directories: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

/** Instantiate the service over a throwaway context fiber. */
async function harness(): Promise<SdkworkGit> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SdkworkGit)
  return ctx.get('sdkworkGit') as SdkworkGit
}

/** Environment for hermetic git fixtures: fixed identity, fixed branch name. */
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@example.com',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
}

/** Run one git command inside a fixture directory. */
async function git(cwd: string, ...args: string[]): Promise<void> {
  await run('git', args, { cwd, env: GIT_ENV })
}

/** Create a temp repo with one committed file on branch `main`. */
async function repo(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sdkwork-git-'))
  directories.push(directory)
  await git(directory, 'init', '--initial-branch=main')
  await writeFile(join(directory, 'file.txt'), 'one\n', 'utf8')
  await git(directory, 'add', 'file.txt')
  await git(directory, 'commit', '-m', 'first commit')
  return directory
}

describe('sdkwork-git open()', () => {
  it('rejects a relative cwd with cwd-unreadable', async () => {
    const service = await harness()
    await expect(service.status({ cwd: 'relative/path' })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'cwd-unreadable',
    })
  })

  it('rejects a missing directory with cwd-unreadable', async () => {
    const service = await harness()
    await expect(service.status({ cwd: join(tmpdir(), 'sdkwork-git-missing') })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'cwd-unreadable',
    })
  })

  it('rejects a non-repository directory with not-a-repo', async () => {
    const service = await harness()
    const directory = await mkdtemp(join(tmpdir(), 'sdkwork-git-plain-'))
    directories.push(directory)
    await expect(service.status({ cwd: directory })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'not-a-repo',
    })
  })
})

describe('sdkwork-git status()', () => {
  it('reports the branch, clean tree, and zero ahead/behind after a commit', async () => {
    const service = await harness()
    const directory = await repo()
    const status = await service.status({ cwd: directory })
    expect(status.branch).toBe('main')
    expect(status.dirtyCount).toBe(0)
    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
    expect(status.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('counts every uncommitted path: modified plus untracked', async () => {
    const service = await harness()
    const directory = await repo()
    await writeFile(join(directory, 'file.txt'), 'two\n', 'utf8')
    await writeFile(join(directory, 'extra.txt'), 'new\n', 'utf8')
    const status = await service.status({ cwd: directory })
    expect(status.dirtyCount).toBe(2)
  })

  it('reports added and deleted line totals across the working-tree diff', async () => {
    const service = await harness()
    const directory = await repo()
    // 1 deleted line, 3 added lines in the tracked file; 3 lines untracked.
    await writeFile(join(directory, 'file.txt'), 'one-modified\ntwo\nthree\n', 'utf8')
    await writeFile(join(directory, 'extra.txt'), 'a\nb\nc\n', 'utf8')
    const status = await service.status({ cwd: directory })
    expect(status.additions).toBe(6)
    expect(status.deletions).toBe(1)
  })

  it('reports zero totals on a clean tree', async () => {
    const service = await harness()
    const directory = await repo()
    const status = await service.status({ cwd: directory })
    expect(status.additions).toBe(0)
    expect(status.deletions).toBe(0)
  })
})

describe('sdkwork-git branches()', () => {
  it('lists local branches with the current branch first, then name order', async () => {
    const service = await harness()
    const directory = await repo()
    await git(directory, 'branch', 'feature/alpha')
    await git(directory, 'branch', 'wip/beta')
    const listing = await service.branches({ cwd: directory })
    expect(listing.current).toBe('main')
    expect(listing.branches.map(branch => branch.name)).toEqual([
      'main', 'feature/alpha', 'wip/beta',
    ])
    const main = listing.branches[0]
    expect(main?.current).toBe(true)
  })

  it('reports null current on a detached HEAD (derived from the listing marker)', async () => {
    const service = await harness()
    const directory = await repo()
    const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: directory, env: GIT_ENV })).stdout.trim()
    await git(directory, 'checkout', '--detach', head)
    const listing = await service.branches({ cwd: directory })
    expect(listing.current).toBeNull()
    expect(listing.branches.every(branch => branch.current === false)).toBe(true)
  })
})

describe('sdkwork-git checkout()', () => {
  it('switches to an existing local branch and reports it', async () => {
    const service = await harness()
    const directory = await repo()
    await git(directory, 'branch', 'feature/alpha')
    const result = await service.checkout({ cwd: directory, branch: 'feature/alpha' })
    expect(result.branch).toBe('feature/alpha')
    const status = await service.status({ cwd: directory })
    expect(status.branch).toBe('feature/alpha')
  })

  it('fails with checkout-failed for a missing local branch', async () => {
    const service = await harness()
    const directory = await repo()
    await expect(service.checkout({ cwd: directory, branch: 'no-such-branch' })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'checkout-failed',
    })
  })
})

describe('sdkwork-git createAndCheckout()', () => {
  it('creates the branch at HEAD and checks it out', async () => {
    const service = await harness()
    const directory = await repo()
    const result = await service.createAndCheckout({ cwd: directory, name: 'wip/new-work' })
    expect(result.branch).toBe('wip/new-work')
    const status = await service.status({ cwd: directory })
    expect(status.branch).toBe('wip/new-work')
  })

  it('rejects a name failing git ref-format with branch-name-invalid', async () => {
    const service = await harness()
    const directory = await repo()
    await expect(service.createAndCheckout({ cwd: directory, name: 'bad name..' })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'branch-name-invalid',
    })
  })
})

describe('sdkwork-git log()', () => {
  it('returns newest-first rows with parents, decorations, and parsed fields', async () => {
    const service = await harness()
    const directory = await repo()
    await writeFile(join(directory, 'file.txt'), 'two\n', 'utf8')
    await git(directory, 'add', 'file.txt')
    await git(directory, 'commit', '-m', 'second commit')
    const { entries } = await service.log({ cwd: directory, limit: 5 })
    expect(entries.map(entry => entry.subject)).toEqual(['second commit', 'first commit'])
    expect(entries[0]?.parents).toEqual([entries[1]?.hash])
    expect(entries[1]?.parents).toEqual([])
    // The head branch rides the newest row's refs.
    expect(entries[0]?.refs.head).toBe('main')
    expect(entries[0]?.author).toBe('fixture')
    expect(entries[0]?.time).toBeGreaterThan(0)
    expect(entries[0]?.hash).toMatch(/^[0-9a-f]{40}$/)
  })

  it('classifies remote-tracking and tag decorations against the remote ref set', async () => {
    const service = await harness()
    const directory = await repo()
    await git(directory, 'branch', 'feature/alpha')
    await git(directory, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    await git(directory, 'tag', 'v0.1.0')
    const { entries } = await service.log({ cwd: directory, limit: 5 })
    const refs = entries[0]?.refs
    expect(refs?.head).toBe('main')
    expect(refs?.branches).toEqual(['feature/alpha'])
    expect(refs?.remotes).toEqual(['origin/main'])
    expect(refs?.tags).toEqual(['v0.1.0'])
  })

  it('rejects an out-of-range limit with command-failed', async () => {
    const service = await harness()
    const directory = await repo()
    await expect(service.log({ cwd: directory, limit: 0 })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'command-failed',
    })
  })
})

describe('sdkwork-git commit()', () => {
  it('commits staged changes and reports the new hash and branch', async () => {
    const service = await harness()
    const directory = await repo()
    await writeFile(join(directory, 'file.txt'), 'two\n', 'utf8')
    await git(directory, 'add', 'file.txt')
    const result = await service.commit({ cwd: directory, message: 'second commit', includeUnstaged: false })
    expect(result.branch).toBe('main')
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/)
    const status = await service.status({ cwd: directory })
    expect(status.dirtyCount).toBe(0)
    expect(status.commit).toBe(result.commit)
  })

  it('with includeUnstaged stages modified and untracked paths before committing', async () => {
    const service = await harness()
    const directory = await repo()
    await writeFile(join(directory, 'file.txt'), 'two\n', 'utf8')
    await writeFile(join(directory, 'extra.txt'), 'new\n', 'utf8')
    const result = await service.commit({ cwd: directory, message: 'everything', includeUnstaged: true })
    expect(result.branch).toBe('main')
    const status = await service.status({ cwd: directory })
    expect(status.dirtyCount).toBe(0)
  })

  it('rejects an empty message with commit-failed', async () => {
    const service = await harness()
    const directory = await repo()
    await expect(service.commit({ cwd: directory, message: '   ', includeUnstaged: true })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'commit-failed',
    })
  })

  it('rejects a commit with nothing staged with commit-failed', async () => {
    const service = await harness()
    const directory = await repo()
    await expect(service.commit({ cwd: directory, message: 'empty', includeUnstaged: false })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'commit-failed',
    })
  })
})

describe('sdkwork-git push()', () => {
  it('rejects a branch without an upstream with push-failed', async () => {
    const service = await harness()
    const directory = await repo()
    await expect(service.push({ cwd: directory })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'push-failed',
    })
  })

  it('pushes to the upstream remote and reports the ref', async () => {
    const service = await harness()
    const directory = await repo()
    // A bare origin plus an upstream branch keep the fixture hermetic (no
    // network). The explicit timeout keeps the two git subprocess pushes
    // inside the default 5s vitest bound on slow Windows file systems.
    const bare = await mkdtemp(join(tmpdir(), 'sdkwork-git-bare-'))
    directories.push(bare)
    await git(bare, 'init', '--bare', '--initial-branch=main')
    await git(directory, 'remote', 'add', 'origin', bare)
    await git(directory, 'push', '-u', 'origin', 'main')
    await writeFile(join(directory, 'file.txt'), 'two\n', 'utf8')
    await service.commit({ cwd: directory, message: 'second commit', includeUnstaged: true })
    const result = await service.push({ cwd: directory })
    expect(result.branch).toBe('main')
    expect(result.upstream).toBe('origin/main')
  }, 20_000)

  it('rejects pushing a detached HEAD with push-failed', async () => {
    const service = await harness()
    const directory = await repo()
    await git(directory, 'checkout', '--detach')
    await expect(service.push({ cwd: directory })).rejects.toMatchObject({
      name: 'SdkworkGitError',
      code: 'push-failed',
    })
  })
})

describe('sdkwork-git error projection', () => {
  it('keeps SdkworkGitError instances intact through commandFailure', () => {
    const original = new SdkworkGitError('not-a-repo', 'kept')
    expect(original.code).toBe('not-a-repo')
    expect(original.name).toBe('SdkworkGitError')
  })
})
