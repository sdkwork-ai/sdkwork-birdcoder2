/** The "ask every time" chooser bubble, body-mounted through an isolated React root. */

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExplorerOpenMode } from '../explorer-settings.ts'
import css from './OpenChooser.module.css'

export interface OpenChooserProps {
  /** Bubble title (file vs link wording). */
  title: string
  /** Viewport anchor of the initiating click. */
  x: number
  y: number
  /** Namespace-bound translate (the plugin's `t` seat). */
  t: TranslateNS<'explorer'>
  /** Resolve the bubble: chosen mode and whether to remember it. */
  onPick: (mode: ExplorerOpenMode, remember: boolean) => void
  /** Dismiss without choosing. */
  onClose: () => void
}

/** Clamp the bubble inside the viewport with a margin. */
function anchoredStyle(x: number, y: number): CSSProperties {
  const margin = 12
  const width = 300
  const height = 170
  return {
    left: Math.min(Math.max(x - width / 2, margin), Math.max(window.innerWidth - width - margin, margin)),
    top: Math.min(Math.max(y + 8, margin), Math.max(window.innerHeight - height - margin, margin)),
  }
}

/**
 * Render one chooser bubble: two open-mode options with descriptions plus an
 * "always use this choice" checkbox. Dismisses on outside pointerdown and
 * Escape. Mounted by {@link mountOpenChooser} into its own body root.
 */
export function OpenChooser({ title, x, y, t, onPick, onClose }: OpenChooserProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (rootRef.current !== null && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  return (
    <div ref={rootRef} className={css.root} style={anchoredStyle(x, y)} data-explorer-chooser>
      <div className={css.title}>{title}</div>
      <button type="button" className={css.option} onClick={() => { onPick('builtin', remember) }}>
        <span className={css.optionTitle}>{t('chooser.builtin')}</span>
        <span className={css.optionDesc}>{t('chooser.builtin.desc')}</span>
      </button>
      <button type="button" className={css.option} onClick={() => { onPick('native', remember) }}>
        <span className={css.optionTitle}>{t('chooser.native')}</span>
        <span className={css.optionDesc}>{t('chooser.native.desc')}</span>
      </button>
      <label className={css.remember}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => { setRemember(event.target.checked) }}
        />
        {t('chooser.remember')}
      </label>
    </div>
  )
}
