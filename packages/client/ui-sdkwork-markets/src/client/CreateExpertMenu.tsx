/**
 * The my-experts page's create affordance: a primary "Create expert" trigger
 * whose menu opens on hover (mouse and pen) and toggles on click, so keyboard
 * and touch users drive the same surface. The menu lists the three expert
 * types — locally running, remote, personal VM — and each selection dispatches
 * its guided creation prompt into a fresh conversation, the same channel the
 * Plugins and Skills markets' create flows run through. Leaving the trigger
 * and menu arms a short grace before the close, so crossing the gap between
 * them never collapses the menu; outside pointerdown and Escape close at once.
 */
import { useEffect, useRef, useState } from 'react'
import type { ComponentType, PointerEvent as ReactPointerEvent } from 'react'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { ExpertLocalIcon, ExpertRemoteIcon, ExpertVmIcon, PlusIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import css from './MineExpertsPage.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** Full props for the create-expert affordance. */
export interface CreateExpertMenuProps {
  /** The locale seat. */
  t: Translate
  /** Dispatch the composed prompt into a fresh conversation (create flows). */
  dispatchPrompt: (text: string) => void
}

/** How long the pointer may stay off the trigger and menu before the menu closes. */
const LEAVE_GRACE_MS = 150

/** One menu row: glyph, title, description copy, and the prompt its selection dispatches. */
interface ExpertTypeItem {
  icon: ComponentType<ModeIconProps>
  title: MarketsKey
  desc: MarketsKey
  prompt: MarketsKey
}

/** The three expert types, in menu order. */
const MENU_ITEMS: readonly ExpertTypeItem[] = [
  {
    icon: ExpertLocalIcon,
    title: 'mine.experts.create.local',
    desc: 'mine.experts.create.local.desc',
    prompt: 'prompt.experts.create.local',
  },
  {
    icon: ExpertRemoteIcon,
    title: 'mine.experts.create.remote',
    desc: 'mine.experts.create.remote.desc',
    prompt: 'prompt.experts.create.remote',
  },
  {
    icon: ExpertVmIcon,
    title: 'mine.experts.create.vm',
    desc: 'mine.experts.create.vm.desc',
    prompt: 'prompt.experts.create.vm',
  },
]

/** One menu row: glyph, title, and description copy. */
function MenuItem({
  icon: Icon, title, desc, onSelect,
}: {
  icon: ComponentType<ModeIconProps>
  title: string
  desc: string
  onSelect: () => void
}) {
  return (
    <button type="button" role="menuitem" className={css.menuItem} aria-label={title} onClick={onSelect}>
      <Icon size={16} className={css.menuItemIcon} />
      <span className={css.menuItemCopy}>
        <span className={css.menuItemTitle}>{title}</span>
        <span className={css.menuItemDesc}>{desc}</span>
      </span>
    </button>
  )
}

/**
 * Render the create trigger and its hover menu.
 * @param props - the locale seat plus the create flows' dispatch callback.
 * @returns the affordance element tree.
 */
export function CreateExpertMenu({ t, dispatchPrompt }: CreateExpertMenuProps) {
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
            return (
              <MenuItem
                key={item.title}
                icon={Icon}
                title={t(item.title)}
                desc={t(item.desc)}
                onSelect={() => {
                  setOpen(false)
                  dispatchPrompt(t(item.prompt))
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
