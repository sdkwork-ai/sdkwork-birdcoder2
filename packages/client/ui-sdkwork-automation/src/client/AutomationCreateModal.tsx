/**
 * Add-scheduled-task dialog (需求: 「添加定时任务」弹窗, 文案与布局见图):
 * the shared Modal primitive carries the title/close chrome; the body is a
 * name field, a prompt composer with the generation-preference picker, the
 * workspace / full-access row, the frequency + validity pickers, and the two
 * push-channel toggles. The task-creation capability has no host behind it
 * yet, so confirm only closes the dialog — the draft state lives here until
 * the real creation flow lands.
 */
import { useEffect, useState } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  ChevronDownIcon, FolderIcon, InfoIcon, PlusIcon,
} from './icons.tsx'
import type { NS } from './locales.ts'
import css from './AutomationCreateModal.module.css'

/** One execution-frequency pick id. */
type Frequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly'

/** Frequency option ids, in picker order. */
const FREQUENCIES: readonly Frequency[] = ['once', 'hourly', 'daily', 'weekly', 'monthly']

/** Frequency dictionary keys, in {@link FREQUENCIES} order. */
const FREQUENCY_KEYS = {
  once: 'create.frequencyOnce',
  hourly: 'create.frequencyHourly',
  daily: 'create.frequencyDaily',
  weekly: 'create.frequencyWeekly',
  monthly: 'create.frequencyMonthly',
} as const

/** One validity pick id. */
type Validity = 'forever' | 'until'

/** Full props for the create-task dialog. */
export interface AutomationCreateModalProps {
  open: boolean
  onClose: () => void
  t: TranslateNS<typeof NS>
}

/**
 * The add-task dialog: form fields render and hold local draft state only;
 * confirm closes without creating anything until the capability lands.
 * @param props - open state, close callback, locale seat.
 * @returns the modal tree, or null while closed.
 */
export function AutomationCreateModal({ open, onClose, t }: AutomationCreateModalProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<'balanced' | 'precise'>('balanced')
  const [frequency, setFrequency] = useState<Frequency>('once')
  const [runAt, setRunAt] = useState('')
  const [validity, setValidity] = useState<Validity>('forever')
  const [untilDate, setUntilDate] = useState('')
  const [pushWorkBuddy, setPushWorkBuddy] = useState(false)
  const [pushWecomBot, setPushWecomBot] = useState(false)

  // Re-open resets the draft: the dialog is a one-shot create form.
  useEffect(() => {
    if (open) {
      setName('')
      setPrompt('')
      setModel('balanced')
      setFrequency('once')
      setRunAt('')
      setValidity('forever')
      setUntilDate('')
      setPushWorkBuddy(false)
      setPushWecomBot(false)
    }
  }, [open])

  if (!open) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('create.title')}
      closeLabel={t('create.close')}
      className={css.dialog}
      contentClassName={css.scrollBody}
      footer={(
        <div className={css.footerRow}>
          <button type="button" className={css.ghostButton} onClick={onClose}>
            {t('create.cancel')}
          </button>
          <button
            type="button"
            className={css.primaryButton}
            disabled={name.trim() === ''}
            onClick={onClose}
          >
            {t('create.confirm')}
          </button>
        </div>
      )}
    >
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); onClose() }}>
        <label className={css.fieldLabel} htmlFor="sdkwork-automation-create-name">{t('create.nameLabel')}</label>
        <input
          id="sdkwork-automation-create-name"
          className={css.fieldInput}
          type="text"
          value={name}
          placeholder={t('create.namePlaceholder')}
          onChange={(event) => { setName(event.target.value) }}
        />

        <label className={css.fieldLabel} htmlFor="sdkwork-automation-create-prompt">{t('create.promptLabel')}</label>
        <div className={css.promptBox}>
          <textarea
            id="sdkwork-automation-create-prompt"
            className={css.promptInput}
            value={prompt}
            placeholder={t('create.promptPlaceholder')}
            onChange={(event) => { setPrompt(event.target.value) }}
          />
          <div className={css.promptToolbar}>
            <button
              type="button"
              className={css.promptAppend}
              aria-label={t('create.promptAppend')}
              title={t('create.promptAppend')}
              onClick={() => { setPrompt(prev => `${prev}\n`) }}
            >
              <PlusIcon size={14} />
            </button>
            <span className={css.pickShell}>
              <select
                className={css.pick}
                aria-label={t('create.promptModel')}
                value={model}
                onChange={(event) => { setModel(event.target.value === 'precise' ? 'precise' : 'balanced') }}
              >
                <option value="balanced">{t('create.modelBalanced')}</option>
                <option value="precise">{t('create.modelPrecise')}</option>
              </select>
              <ChevronDownIcon size={12} className={css.pickChevron} />
            </span>
          </div>
        </div>
        <div className={css.scopeRow}>
          <button type="button" className={css.scopeButton}>
            <FolderIcon size={14} className={css.scopeIcon} />
            {t('create.workspace')}
            <ChevronDownIcon size={12} className={css.scopeChevron} />
          </button>
          <button type="button" className={css.scopeButton} title={t('create.fullAccessHint')}>
            <InfoIcon size={14} className={css.scopeDangerIcon} />
            <span className={css.scopeDangerLabel}>{t('create.fullAccess')}</span>
            <ChevronDownIcon size={12} className={css.scopeChevron} />
          </button>
        </div>

        <div className={css.scheduleRow}>
          <span className={css.scheduleLabel}>
            {t('create.frequencyLabel')}
            {'：'}
          </span>
          <span className={css.pickShell}>
            <select
              className={css.pick}
              aria-label={t('create.frequencyLabel')}
              value={frequency}
              onChange={(event) => { setFrequency((FREQUENCIES as readonly string[]).includes(event.target.value) ? event.target.value as Frequency : 'once') }}
            >
              {FREQUENCIES.map(id => (
                <option key={id} value={id}>{t(FREQUENCY_KEYS[id])}</option>
              ))}
            </select>
            <ChevronDownIcon size={12} className={css.pickChevron} />
          </span>
          {frequency === 'once' && (
            <input
              className={css.fieldInput}
              type="datetime-local"
              aria-label={t('create.frequencyDate')}
              value={runAt}
              onChange={(event) => { setRunAt(event.target.value) }}
            />
          )}
          <span className={css.scheduleLabel}>
            {t('create.validityLabel')}
            {'：'}
          </span>
          <span className={css.pickShell}>
            <select
              className={css.pick}
              aria-label={t('create.validityLabel')}
              value={validity}
              onChange={(event) => { setValidity(event.target.value === 'until' ? 'until' : 'forever') }}
            >
              <option value="forever">{t('create.validityForever')}</option>
              <option value="until">{t('create.validityUntil')}</option>
            </select>
            <ChevronDownIcon size={12} className={css.pickChevron} />
          </span>
          {validity === 'until' && (
            <input
              className={css.fieldInput}
              type="date"
              aria-label={t('create.validityDate')}
              value={untilDate}
              onChange={(event) => { setUntilDate(event.target.value) }}
            />
          )}
        </div>

        <div className={css.pushRow}>
          <label className={css.pushItem} title={t('create.pushHint')}>
            <span className={css.pushLabel}>{t('create.pushWorkBuddy')}</span>
            <InfoIcon size={13} className={css.pushInfo} />
            <button
              type="button"
              role="switch"
              aria-checked={pushWorkBuddy}
              className={css.toggle}
              onClick={() => { setPushWorkBuddy(prev => !prev) }}
            >
              <span className={css.toggleKnob} />
            </button>
          </label>
          <label className={css.pushItem} title={t('create.pushHint')}>
            <span className={css.pushLabel}>{t('create.pushWecomBot')}</span>
            <InfoIcon size={13} className={css.pushInfo} />
            <button
              type="button"
              role="switch"
              aria-checked={pushWecomBot}
              className={css.toggle}
              onClick={() => { setPushWecomBot(prev => !prev) }}
            >
              <span className={css.toggleKnob} />
            </button>
          </label>
        </div>
      </form>
    </Modal>
  )
}
