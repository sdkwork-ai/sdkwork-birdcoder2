/**
 * sdkwork-git controller wire face: payload validation, seam-failure
 * projection onto the `git/*` Remote codes, and pass-through of seam values,
 * exercised over a stubbed `sdkworkGit` seam.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SdkworkGitError } from '@deepseek-ai/dsh-sdkwork-git'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { SdkworkGitController } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

interface SeamStubCalls {
  readonly status: unknown[]
  readonly branches: unknown[]
  readonly checkout: unknown[]
  readonly createAndCheckout: unknown[]
  readonly log: unknown[]
}

/** Mount the controller over a seam stub that records calls or fails on demand. */
async function harness(options: {
  fail?: (method: string) => never
} = {}): Promise<{ controller: SdkworkGitController; calls: SeamStubCalls }> {
  const ctx = new Context()
  contexts.push(ctx)
  const calls: SeamStubCalls = {
    status: [], branches: [], checkout: [], createAndCheckout: [], log: [],
  }
  const ok = <T>(value: T): Promise<T> => Promise.resolve(value)
  ctx.provide('sdkworkGit', {
    status: (request: unknown) => {
      calls.status.push(request)
      return options.fail?.('status') ?? ok({ branch: 'main', commit: 'a'.repeat(40), dirtyCount: 0, ahead: 0, behind: 0 })
    },
    branches: (request: unknown) => {
      calls.branches.push(request)
      return options.fail?.('branches') ?? ok({ current: 'main', branches: [] })
    },
    checkout: (request: unknown) => {
      calls.checkout.push(request)
      return options.fail?.('checkout') ?? ok({ branch: 'feature/x' })
    },
    createAndCheckout: (request: unknown) => {
      calls.createAndCheckout.push(request)
      return options.fail?.('createAndCheckout') ?? ok({ branch: 'wip/new' })
    },
    log: (request: unknown) => {
      calls.log.push(request)
      return options.fail?.('log') ?? ok({ entries: [], truncated: false })
    },
  })
  await ctx.plugin(SdkworkGitController)
  return { controller: ctx.get('sdkworkGitController') as SdkworkGitController, calls }
}

describe('sdkwork-git controller validation', () => {
  it('rejects a relative cwd with gateway/bad-request before reaching the seam', async () => {
    const { controller, calls } = await harness()
    const failure = await controller.status({ cwd: 'relative/path' }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(RemoteError)
    expect((failure as RemoteError).code).toBe('gateway/bad-request')
    expect(calls.status).toEqual([])
  })

  it('rejects branch checkout of a whitespace name with gateway/bad-request', async () => {
    const { controller, calls } = await harness()
    const failure = await controller.checkout({ cwd: '/repo', branch: 'two words' }).catch((error: unknown) => error)
    expect((failure as RemoteError).code).toBe('gateway/bad-request')
    expect(calls.checkout).toEqual([])
  })

  it('rejects a blank create name and an out-of-range log limit', async () => {
    const { controller } = await harness()
    await expect(controller.createAndCheckout({ cwd: '/repo', name: '' })).rejects.toMatchObject({
      code: 'gateway/bad-request',
    })
    await expect(controller.log({ cwd: '/repo', limit: 0 })).rejects.toMatchObject({
      code: 'gateway/bad-request',
    })
  })
})

describe('sdkwork-git controller pass-through', () => {
  it('forwards validated requests and returns seam values unchanged', async () => {
    const { controller, calls } = await harness()
    const status = await controller.status({ cwd: '/repo' })
    expect(status).toEqual({ branch: 'main', commit: 'a'.repeat(40), dirtyCount: 0, ahead: 0, behind: 0 })
    expect(calls.status).toEqual([{ cwd: '/repo' }])
    await expect(controller.branches({ cwd: '/repo' })).resolves.toEqual({ current: 'main', branches: [] })
    await expect(controller.checkout({ cwd: '/repo', branch: 'feature/x' })).resolves.toEqual({ branch: 'feature/x' })
    await expect(controller.createAndCheckout({ cwd: '/repo', name: 'wip/new' })).resolves.toEqual({ branch: 'wip/new' })
    await expect(controller.log({ cwd: '/repo', limit: 10 })).resolves.toEqual({ entries: [], truncated: false })
    expect(calls.log).toEqual([{ cwd: '/repo', limit: 10 }])
  })
})

describe('sdkwork-git controller failure projection', () => {
  it('projects each seam code onto its git/* wire code', async () => {
    const codes = ['cwd-unreadable', 'not-a-repo', 'branch-name-invalid', 'checkout-failed', 'command-failed'] as const
    for (const code of codes) {
      const { controller } = await harness({ fail: (method) => {
        throw new SdkworkGitError(code, `boom: ${method}`)
      } })
      const failure = await controller.status({ cwd: '/repo' }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(RemoteError)
      expect((failure as RemoteError).code).toBe(`git/${code}`)
    }
  })

  it('wraps non-seam rejections as gateway/internal', async () => {
    const { controller } = await harness({ fail: () => {
      throw new Error('git binary vanished')
    } })
    await expect(controller.status({ cwd: '/repo' })).rejects.toMatchObject({ code: 'gateway/internal' })
  })
})
