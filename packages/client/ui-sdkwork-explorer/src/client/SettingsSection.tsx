/** Settings-section rows for the explorer open modes. */

import { useState } from 'react'
import { useSyncExternalStore } from 'react'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { OPEN_MODES, type ExplorerOpenMode } from '../explorer-settings.ts'
import type { OpenModePolicy, OpenModeSubject } from './policy.ts'
import css from './SettingsSection.module.css'

/** Inject face of the explorer settings-section registration. */
export interface ExplorerSettingsInjected {
  /** Live open-mode policy (durable settings scope backed). */
  policy: OpenModePolicy
}

/** Full props of the explorer settings section. */
export type ExplorerSettingsProps =
  & PropsRuntime<'settings.section'>
  & ExplorerSettingsInjected
  & PropsLocale<'explorer'>

const MODE_LABEL_KEY: Record<ExplorerOpenMode, 'settings.mode.builtin' | 'settings.mode.native' | 'settings.mode.ask'> = {
  builtin: 'settings.mode.builtin',
  native: 'settings.mode.native',
  ask: 'settings.mode.ask',
}

function OpenModeRow({ subject, current, onChange, t }: {
  subject: OpenModeSubject
  current: ExplorerOpenMode
  onChange: (mode: ExplorerOpenMode) => void
  t: ExplorerSettingsProps['t']
}) {
  const [open, setOpen] = useState(false)
  const title = subject === 'file' ? t('settings.fileOpen') : t('settings.linkOpen')
  const desc = subject === 'file' ? t('settings.fileOpen.desc') : t('settings.linkOpen.desc')
  const close = () => { setOpen(false) }
  const selector = (
    <button
      type="button"
      className={css.selector}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => { setOpen(value => !value) }}
    >
      {t(MODE_LABEL_KEY[current])}
      <IconChevronDownOutline14 className={css.chevron} />
    </button>
  )
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.rowTitle}>{title}</div>
        <div className={css.rowDesc}>{desc}</div>
      </div>
      <Menu
        open={open}
        onClose={close}
        items={OPEN_MODES.map(mode => ({ id: mode, label: t(MODE_LABEL_KEY[mode]) }))}
        selectedId={current}
        onSelect={(id) => { close(); onChange(id as ExplorerOpenMode) }}
        align="end"
        portal
        anchor={selector}
      />
    </div>
  )
}

/**
 * Render the explorer settings section: one open-mode selector per gesture
 * kind, persisted through the Host settings document.
 */
export function ExplorerSettingsSection({ policy, t }: ExplorerSettingsProps) {
  // Closure-bound store faces: useSyncExternalStore invokes both members
  // unbound, and SnapshotStore's methods are prototype methods.
  const fileMode = useSyncExternalStore(
    listener => policy.file.subscribe(listener),
    () => policy.file.getSnapshot(),
  )
  const linkMode = useSyncExternalStore(
    listener => policy.link.subscribe(listener),
    () => policy.link.getSnapshot(),
  )
  return (
    <div className={css.root}>
      <div className={css.header}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.desc}>{t('settings.description')}</div>
      </div>
      <OpenModeRow subject="file" current={fileMode} onChange={(mode) => { policy.set('file', mode) }} t={t} />
      <OpenModeRow subject="link" current={linkMode} onChange={(mode) => { policy.set('link', mode) }} t={t} />
    </div>
  )
}
