/**
 * The Plugins market's add affordance: an "Add" trigger with a caret that
 * opens a two-item menu — "Create plugin" (dispatch a skill-guided creation
 * prompt into a fresh conversation) and "Add plugin market" (open the entry
 * dialog). The menu closes on selection, outside pointerdown, and Escape;
 * the trigger keeps `aria-haspopup`/`aria-expanded` so tests and assistive
 * tech read the same open state.
 */
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { CaretDownIcon, PlusIcon, SparkIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import css from './MarketsAdd.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** Full props for the add affordance. */
export interface MarketsAddProps {
  /** The locale seat. */
  t: Translate
  /** Dispatch the composed prompt into a fresh conversation (create flow). */
  dispatchPrompt: (text: string) => void
  /** Open the add-market entry dialog. */
  onAddMarket: () => void
}

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
    <button type="button" role="menuitem" className={css.item} aria-label={title} onClick={onSelect}>
      <Icon size={16} className={css.itemIcon} />
      <span className={css.itemCopy}>
        <span className={css.itemTitle}>{title}</span>
        <span className={css.itemDesc}>{desc}</span>
      </span>
    </button>
  )
}

/**
 * Render the add trigger and its menu.
 * @param props - the locale seat plus the two flow callbacks.
 * @returns the affordance element tree.
 */
export function MarketsAdd({ t, dispatchPrompt, onAddMarket }: MarketsAddProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Outside pointerdown and Escape close the menu; the trigger's own click
  // toggles, so the outside listener must ignore events inside the root.
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

  return (
    <div className={css.wrap} ref={root} data-markets-add="">
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('add.aria')}
        onClick={() => { setOpen(v => !v) }}
      >
        <PlusIcon size={14} className={css.triggerIcon} />
        {t('add.label')}
        <CaretDownIcon size={12} className={css.triggerCaret} />
      </button>
      {open && (
        <div className={css.menu} role="menu" aria-label={t('add.aria')}>
          <MenuItem
            icon={SparkIcon}
            title={t('add.create.title')}
            desc={t('add.create.desc')}
            onSelect={() => {
              setOpen(false)
              dispatchPrompt(t('prompt.create'))
            }}
          />
          <MenuItem
            icon={PlusIcon}
            title={t('add.market.title')}
            desc={t('add.market.desc')}
            onSelect={() => {
              setOpen(false)
              onAddMarket()
            }}
          />
        </div>
      )}
    </div>
  )
}
