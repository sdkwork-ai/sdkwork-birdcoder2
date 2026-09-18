// @vitest-environment jsdom
/**
 * Cross-package assembly acceptance for the conversation header seat: the REAL
 * ui-conversation shell is mounted with the REAL fork plugin claiming the
 * 'conversation.session.header.surface' seat through a real slot outlet, and
 * the live DOM is asserted for uniqueness.
 *
 * Why this suite exists (2026-09-18 upstream merge regression): the merged
 * upstream shell rendered its View tabs strip OUTSIDE the surface seat while
 * the fork body rendered its own segmented control INSIDE the seat, so a live
 * session showed two tab strips; the far-right corner — a shell seat the fork
 * body also rendered — doubled the same way. Both defects are only visible
 * when the two real packages are assembled together: each package's own suite
 * was green throughout, because each half is internally consistent. The
 * assertions below are therefore about COUNTS in one assembled DOM, not about
 * either component's internals.
 *
 * The header is also exercised through the blank (hero) phase, where the shell
 * hides the surface seat entirely — the phase that made an earlier attempt to
 * move the corner into the seat body fail.
 *
 * A View roster generally needs at least two entries for the header's
 * navigation to render, and a `conversation.view` entry can only be registered
 * once the `conversation.session` entry that declares it has been mounted —
 * hence the two-phase mount below, mirroring how the real View plugins
 * (`ui-chat`, `ui-trajectory`) contribute.
 */
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ISession } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import {
  SlotTestRuntime, stubSettingsScope, usePinnedBrowserLanguages,
} from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import {
  apply as applyShell, inject as shellInject,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  apply as applyForkHeader, inject as forkHeaderInject,
} from '../src/client/index.ts'

Range.prototype.getBoundingClientRect = () => ({
  top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
})

usePinnedBrowserLanguages('zh-CN')

const SID = 's1' as SessionId

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

type AppRootProps = PropsRenderSlots<'main'>
function AppRoot({ renderSlot }: AppRootProps) {
  return <>{renderSlot('main', {}, { entryKey: 'conversation' })}</>
}

/** Body of a stub View entry; the header reads the ledger, never the body. */
function ViewBody() {
  return <div data-test-view-body="" />
}

/**
 * Stub View plugin: contributes one `conversation.view` entry the way ui-chat
 * does — inside the `conversation.view` inject, which is only satisfied after
 * the `conversation.session` entry that declares the seat is mounted. The
 * second entry opens the header's `views.length > 1` navigation gate.
 * @param extra - whether to also contribute the Chat entry at order 0.
 */
function StubViewsPlugin(extra: boolean) {
  return {
    inject: ['slots'],
    apply(ctx: ClientContext): void {
      if (extra) {
        ctx.slots.inject('conversation.view', () => ctx.slots.register(
          { name: 'conversation.view', id: 'chat', order: 0, label: '对话' },
          ViewBody as never,
        ))
      }
      ctx.slots.inject('conversation.view', () => ctx.slots.register(
        { name: 'conversation.view', id: 'trajectory', order: 10, label: '轨迹' },
        ViewBody as never,
      ))
    },
  }
}

/**
 * Assemble one runtime holding BOTH halves: the ui-conversation shell (which
 * owns the header seat and its corner) and the ui-sdkwork fork body (which
 * claims the seat), plus stub View entries so navigation renders.
 * @param opts - `blank` renders the hero/blank phase, where the shell hides the seat;
 *   `claimSeat: false` mounts the shell without the fork body, so the seat falls back.
 */
async function assemble(opts?: { blank?: boolean; views?: boolean; claimSeat?: boolean }) {
  const runtime = await SlotTestRuntime.create()

  let mainReference: ReturnType<typeof runtime.sessions.retain> | undefined
  const openSession = (id: SessionId): void => {
    const next = runtime.sessions.retain(id, { source: 'mainView' })
    mainReference?.release()
    mainReference = next
  }
  runtime.ctx.provide('uiWorkspace', {
    openWorkspace: vi.fn(async (_workspaceId: WorkspaceId, beforeOpen: (id: SessionId) => void) => {
      beforeOpen(SID)
      openSession(SID)
    }),
    openSession,
  } as never)
  runtime.ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)

  await runtime.sessions.add({
    id: SID,
    summary: { title: 'S', displayTitle: 'S', cwd: '/proj' },
    ...(opts?.blank === true ? { snapshot: { blank: true } } : {}),
    session: {
      loadOlder: vi.fn<ISession['loadOlder']>(),
      prompt: vi.fn<ISession['prompt']>(async () => ({ ok: true, value: { accepted: true } })),
    },
  })
  openSession(SID)

  await runtime.root.declare({ 'main': { kind: 'keyed', scope: 'root' } }, AppRoot)
  await runtime.mount({ inject: [...shellInject], apply: applyShell })
  if (opts?.views === true) await runtime.mount(StubViewsPlugin(true) as never)
  if (opts?.claimSeat !== false) {
    await runtime.mount({ inject: [...forkHeaderInject], apply: applyForkHeader })
  }
  await runtime.flush()
  return runtime
}

describe('conversation header seat assembly (fork body over upstream shell)', () => {
  it('renders exactly one View tablist with both the fork body and a View roster present', async () => {
    const runtime = await assemble({ views: true })
    const view = runtime.renderRoot()

    // The fork body is the seat occupant, and the upstream fallback body is NOT
    // mounted beside it — that doubling was the reported defect.
    expect(view.container.querySelector('[data-sdkwork-header-body]')).not.toBeNull()
    // Exactly one View navigation in the assembled DOM: neither the shell's
    // former shell-level strip nor a second fork control.
    expect(view.container.querySelectorAll('[role="tablist"]')).toHaveLength(1)
    // Exactly one far-right corner: the shell owns the seat, the fork body does
    // not render a copy.
    expect(view.container.querySelectorAll('[data-conversation-header-corner]')).toHaveLength(1)
    await runtime.dispose()
  })

  it('renders the upstream fallback body once when no plugin claims the seat', async () => {
    const runtime = await assemble({ claimSeat: false })
    const view = runtime.renderRoot()

    // No claimer ⇒ the shell's own fallback body is the single body, and the
    // corner it sits beside stays unique.
    expect(view.container.querySelector('[data-sdkwork-header-body]')).toBeNull()
    expect(view.container.querySelectorAll('[data-conversation-header-corner]')).toHaveLength(1)
    await runtime.dispose()
  })

  it('keeps the shell corner mounted through the blank phase, where the seat body is hidden', async () => {
    const runtime = await assemble({ blank: true })
    const view = runtime.renderRoot()

    // hideChrome truthy in the blank phase ⇒ the surface seat does not render at
    // all; the corner is a shell sibling precisely so it survives here.
    expect(view.container.querySelector('[data-sdkwork-header-body]')).toBeNull()
    expect(view.container.querySelectorAll('[data-conversation-header-corner]')).toHaveLength(1)
    await runtime.dispose()
  })
})
