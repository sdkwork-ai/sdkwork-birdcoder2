/**
 * The Input history settings page.
 *
 * A section, not a dialog, because that is the shape the settings shell has:
 * one `settings.section` contribution puts the row in the nav rail and the
 * page in the content column. The page owns recall preferences only — the
 * ledger itself is written by the composer gesture, and the page reads it
 * through the injected history source, so a clear or a retention change shows
 * the same numbers the ↑/↓ gesture will walk.
 *
 * Every edit commits immediately: each control is one unambiguous intent, and
 * a save button would only add a step between the switch and its effect. The
 * retention field is the exception that stages text locally, because a
 * half-typed number is not a value; it commits on blur or Enter, clamped to
 * the supported window.
 */

import { useState, type ReactNode } from 'react'
import { Button, Input, SegmentedControl, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings.section slot declaration this component is mounted from.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  MAX_RETENTION_DAYS, MIN_RETENTION_DAYS,
  type InputHistoryScope, type InputHistoryState,
} from './input-history-store.ts'
import type { InputHistoryKey } from './locales.ts'
import css from './InputHistorySection.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Input history settings page. */
    inputHistory: InputHistoryKey
  }
}

/** Registration-side face: the ledger source plus every preference write the page performs. */
export interface InputHistorySettingsInjected {
  hooks: { history: ObservableSnapshot<InputHistoryState> }
  /** Turn recording and recall on or off. @param enabled - whether the feature is active. */
  setEnabled(enabled: boolean): void
  /** Choose which slice of the ledger ↑/↓ walks. @param scope - recall scope. */
  setScope(scope: InputHistoryScope): void
  /**
   * Set how many days an entry stays recallable.
   * @param days - requested retention; the ledger clamps it to the supported window.
   */
  setRetentionDays(days: number): void
  /** Drop every cached entry, keeping the preferences. */
  clear(): void
}

/** Full component props: section runtime share + injected face + locale seat. */
export type InputHistorySectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<InputHistorySettingsInjected>
  & PropsLocale<'inputHistory'>

/**
 * Render the Input history settings page.
 * @param props - injected history source, preference writers, and localized copy.
 * @returns the page element tree.
 */
export function InputHistorySection(props: InputHistorySectionProps): ReactNode {
  const { useHistory, setEnabled, setScope, setRetentionDays, clear, t } = props
  const settings = useHistory(state => state.settings)
  const count = useHistory(state => state.entries.length)
  const [retentionDraft, setRetentionDraft] = useState(String(settings.retentionDays))

  const commitRetention = (): void => {
    const parsed = Number.parseInt(retentionDraft, 10)
    const days = Number.isFinite(parsed)
      ? Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed))
      : settings.retentionDays
    setRetentionDraft(String(days))
    setRetentionDays(days)
  }

  return (
    <section className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      <div className={css.row}>
        <div className={css.copy}>
          <div className={css.label}>{t('enable.label')}</div>
          <div className={css.hint}>{t('enable.hint')}</div>
        </div>
        <Switch
          checked={settings.enabled}
          label={t('enable.label')}
          onChange={setEnabled}
        />
      </div>

      <div className={css.row}>
        <div className={css.copy}>
          <div className={css.label}>{t('scope.label')}</div>
        </div>
        <SegmentedControl
          id="input-history-scope"
          label={t('scope.label')}
          value={settings.scope}
          disabled={!settings.enabled}
          options={[
            { value: 'session', label: t('scope.session') },
            { value: 'project', label: t('scope.project') },
            { value: 'global', label: t('scope.global') },
          ]}
          onChange={setScope}
        />
      </div>
      {(['session', 'project', 'global'] as const).map(scope => (
        <p
          key={scope}
          id={`input-history-scope-${scope}-panel`}
          role="tabpanel"
          aria-labelledby={`input-history-scope-${scope}`}
          hidden={scope !== settings.scope}
          className={css.hint}
        >
          {t(scope === 'session' ? 'scope.session.hint' : scope === 'project' ? 'scope.project.hint' : 'scope.global.hint')}
        </p>
      ))}

      <div className={css.row}>
        <div className={css.copy}>
          <div className={css.label}>{t('retention.label')}</div>
          <div className={css.hint}>{t('retention.hint')}</div>
        </div>
        <Input
          className={css.retention}
          type="number"
          inputMode="numeric"
          min={MIN_RETENTION_DAYS}
          max={MAX_RETENTION_DAYS}
          step={1}
          value={retentionDraft}
          disabled={!settings.enabled}
          aria-label={t('retention.aria')}
          onChange={(event) => { setRetentionDraft(event.target.value) }}
          onBlur={commitRetention}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            commitRetention()
          }}
        />
      </div>

      <p className={css.keys}>{t('keys.hint')}</p>
      {!settings.enabled && <p className={css.disabled}>{t('disabled.hint')}</p>}

      <div className={css.footer}>
        <span className={css.count}>{t('count', { count })}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={count === 0}
          onClick={clear}
        >
          {t('clear.label')}
        </Button>
      </div>
      <p className={css.hint}>{t('clear.hint')}</p>
    </section>
  )
}
