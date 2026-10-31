/**
 * The my-experts page's create affordance: a primary "Create expert" trigger
 * whose menu opens on hover (mouse and pen) and toggles on click, so keyboard
 * and touch users drive the same surface. The menu lists the three expert
 * types — locally running, remote, personal VM. The remote type enters the
 * SDKWork Agents create flow (basic-info dialog, then the agent editor) via
 * {@link CreateExpertMenuProps.onCreateRemote}; the other two dispatch their
 * guided creation prompt into a fresh conversation, the same channel the
 * Plugins and Skills markets' create flows run through. The remote row is
 * disabled while no gateway is configured, because the flow's first step
 * would fail at the transport. Leaving the trigger and menu arms a short
 * grace before the close, so crossing the gap between them never collapses
 * the menu; outside pointerdown and Escape close at once.
 */
import { useEffect, useRef, useState } from 'react'
import type { ComponentType, PointerEvent as ReactPointerEvent } from 'react'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { ExpertLocalIcon, ExpertRemoteIcon, ExpertVmIcon, PlusIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import css from './MineExpertsPage.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** How long the pointer may stay off the trigger and menu before the menu closes. */
const LEAVE_GRACE_MS = 150

/** What a menu row's selection does. */
type ExpertTypeFlow =
  /** Dispatch the row's guided creation prompt into a fresh conversation. */
  | 'prompt'
  /** Enter the SDKWork Agents create flow (basic-info dialog, then editor). */
  | 'remote'

/** One menu row: glyph, title, description copy, and the flow its selection enters. */
interface ExpertTypeItem {
  icon: ComponentType<ModeIconProps>
  title: MarketsKey
  desc: MarketsKey
  flow: ExpertTypeFlow
  /** The guided prompt, for rows whose flow is `prompt`. */
  prompt?: MarketsKey
}

/** The three expert types, in menu order. */
const MENU_ITEMS: readonly ExpertTypeItem[] = [
  {
    icon: ExpertLocalIcon,
    title: 'mine.experts.create.local',
    desc: 'mine.experts.create.local.desc',
    flow: 'prompt',
    prompt: 'prompt.experts.create.local',
  },
  {
    icon: ExpertRemoteIcon,
    title: 'mine.experts.create.remote',
    desc: 'mine.experts.create.remote.desc',
    flow: 'remote',
  },
  {
    icon: ExpertVmIcon,
    title: 'mine.experts.create.vm',
    desc: 'mine.experts.create.vm.desc',
    flow: 'prompt',
    prompt: 'prompt.experts.create.vm',
  },
]

/** One menu row: glyph, title, and description copy. */
function MenuItem({
  icon: Icon, title, desc, disabled, hint, onSelect,
}: {
  icon: ComponentType<ModeIconProps>
  title: string
  desc: string
  /** Disabled rows render inert and keep the menu open. */
  disabled?: boolean
  /** Why the row is disabled, surfaced as its tooltip. */
  hint?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={css.menuItem}
      aria-label={title}
      aria-disabled={disabled === true ? 'true' : undefined}
      title={hint}
      style={disabled === true ? { cursor: 'not-allowed', opacity: 0.5 } : undefined}
      onClick={() => { if (!disabled) onSelect() }}
    >
      <Icon size={16} className={css.menuItemIcon} />
      <span className={css.menuItemCopy}>
        <span className={css.menuItemTitle}>{title}</span>
        <span className={css.menuItemDesc}>{desc}</span>
      </span>
    </button>
  )
}

/** Full props for the create-expert affordance. */
export interface CreateExpertMenuProps {
  /** The locale seat. */
  t: Translate
  /** Dispatch the composed prompt into a fresh conversation (guided create flows). */
  dispatchPrompt: (text: string) => void
  /** Enter the SDKWork Agents create flow for the remote expert. */
  onCreateRemote: () => void
  /** Whether the remote flow has a configured gateway; off keeps its row disabled. */
  remoteReady: boolean
}

/**
 * Render the create trigger and its hover menu.
 * @param props - the locale seat, the guided flows' dispatch, the remote
 *   create flow's entry, and the remote flow's readiness.
 * @returns the affordance element tree.
 */
export function CreateExpertMenu({ t, dispatchPrompt, onCreateRemote, remoteReady }: CreateExpertMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const cancelPendingClose = (): void => {
    if (closeTimer.current !== undefined) {
      clearTimeout(closeTimer.current)
      closeTimer.current = undefined
    }
  }

  // Hover opens at once; leaving arms the grace instead of closing, so the
  // gap between the trigger and the floating menu never collapses it. Touch
  // has no hover: its tap toggles through the trigger's click.
  const onPointerEnter = (event: ReactPointerEvent): void => {
    if (event.pointerType === 'touch') return
    cancelPendingClose()
    setOpen(true)
  }
  const onPointerLeave = (event: ReactPointerEvent): void => {
    if (event.pointerType === 'touch') return
    cancelPendingClose()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined
      setOpen(false)
    }, LEAVE_GRACE_MS)
  }

  // Outside pointerdown and Escape close the menu immediately; the trigger's
  // own click toggles, so the outside listener must ignore events inside the
  // root.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // The armed grace timer must not fire after unmount.
  useEffect(() => () => {
    if (closeTimer.current !== undefined) clearTimeout(closeTimer.current)
  }, [])

  return (
    <div
      className={css.createWrap}
      ref={root}
      data-mine-experts-create=""
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <button
        type="button"
        className={css.createTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false)
          else {
            cancelPendingClose()
            setOpen(true)
          }
        }}
      >
        <PlusIcon size={14} className={css.createTriggerIcon} />
        {t('mine.experts.create')}
      </button>
      {open && (
        <div className={css.menu} role="menu" aria-label={t('mine.experts.create')}>
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon
            const disabled = item.flow === 'remote' && !remoteReady
            return (
              <MenuItem
                key={item.title}
                icon={Icon}
                title={t(item.title)}
                desc={t(item.desc)}
                disabled={disabled}
                hint={disabled ? t('mine.experts.create.remote.unconfigured') : undefined}
                onSelect={() => {
                  setOpen(false)
                  if (item.flow === 'remote') onCreateRemote()
                  else if (item.prompt !== undefined) dispatchPrompt(t(item.prompt))
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
