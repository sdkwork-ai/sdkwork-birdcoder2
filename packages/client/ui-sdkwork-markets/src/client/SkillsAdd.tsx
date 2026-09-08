/**
 * The Skills market's add affordance: an "Add skill" trigger with a caret
 * that opens a three-item menu — "Find skills" (dispatch a catalog-search
 * prompt through the find-skills skill), "Upload skill" (open the
 * import-skill dialog), and "Create skill" (dispatch a creation prompt
 * through the skill-creator skill). The menu closes on selection, outside
 * pointerdown, and Escape; the trigger keeps `aria-haspopup`/`aria-expanded`
 * so tests and assistive tech read the same open state.
 */
import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import type { ModeIconProps } from '@deepseek-ai/dsh-client-ui-sdkwork-app-modes/client'
import { CaretDownIcon, PlusIcon, SearchIcon, SparkIcon, UploadIcon } from './icons.tsx'
import type { MarketsKey } from './locales.ts'
import css from './MarketsAdd.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** Full props for the skills add affordance. */
export interface SkillsAddProps {
  /** The locale seat. */
  t: Translate
  /** Dispatch the composed prompt into a fresh conversation (find/create flows). */
  dispatchPrompt: (text: string) => void
  /** Open the import-skill dialog (upload flow). */
  onImportSkill: () => void
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
 * @param props - the locale seat plus the three flow callbacks.
 * @returns the affordance element tree.
 */
export function SkillsAdd({ t, dispatchPrompt, onImportSkill }: SkillsAddProps) {
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
    <div className={css.wrap} ref={root} data-markets-add="skills">
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('skills.add.aria')}
        onClick={() => { setOpen(v => !v) }}
      >
        <PlusIcon size={14} className={css.triggerIcon} />
        {t('skills.add.label')}
        <CaretDownIcon size={12} className={css.triggerCaret} />
      </button>
      {open && (
        <div className={css.menu} role="menu" aria-label={t('skills.add.aria')}>
          <MenuItem
            icon={SearchIcon}
            title={t('skills.find.title')}
            desc={t('skills.find.desc')}
            onSelect={() => {
              setOpen(false)
              dispatchPrompt(t('prompt.skills.find.template'))
            }}
          />
          <MenuItem
            icon={UploadIcon}
            title={t('skills.upload.title')}
            desc={t('skills.upload.desc')}
            onSelect={() => {
              setOpen(false)
              onImportSkill()
            }}
          />
          <MenuItem
            icon={SparkIcon}
            title={t('skills.create.title')}
            desc={t('skills.create.desc')}
            onSelect={() => {
              setOpen(false)
              dispatchPrompt(t('prompt.skills.create'))
            }}
          />
        </div>
      )}
    </div>
  )
}
