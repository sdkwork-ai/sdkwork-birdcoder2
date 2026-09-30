/**
 * Add-scheduled-task dialog: the shared Modal primitive carries the
 * title/close chrome; the body is a name field, a prompt composer with the
 * phrasing picker, the workspace / full-access row, the frequency and run-time
 * pickers with the interval row, the validity picker, and the two push-channel
 * toggles.
 *
 * Confirm submits the collected draft to the page, which composes the request
 * that creates the task in a fresh conversation: the Host exposes task creation
 * only as the model-facing `schedule_create` tool, so this dialog never writes a
 * task itself. Opening from a catalog template hands the dialog that template's
 * values as a seed, so a card is a shortcut into the same draft rather than a
 * second creation path.
 */
import { useEffect, useState } from 'react'
import { Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  ChevronDownIcon, FolderIcon, InfoIcon, PlusIcon,
} from './icons.tsx'
import {
  CREATE_FREQUENCIES, CREATE_INTERVAL_UNITS, draftReady, frequencyKey, intervalUnitKey,
  MAX_TASK_NAME_LENGTH, MIN_INTERVAL_SECONDS,
  type AutomationCreateSeed, type AutomationDraft, type CreateFrequency, type CreateIntervalUnit,
  type CreateStyle, type CreateValidity, type CreateWorkspaceId, type CreateWorkspaceOption,
} from './create-request.ts'
import { NS } from './locales.ts'
import css from './AutomationCreateModal.module.css'

/** Frequencies whose run time the dialog asks for; the interval kinds count from creation. */
const TIMED_FREQUENCIES: readonly CreateFrequency[] = ['once', 'daily', 'weekly', 'monthly']

/** Full props for the create-task dialog. */
export interface AutomationCreateModalProps {
  /** Whether the dialog is on screen. */
  open: boolean
  /** Values the dialog opens with; absent opens an empty draft. */
  seed?: AutomationCreateSeed | undefined
  /** Workspaces the picker offers, in catalog order. */
  workspaces: readonly CreateWorkspaceOption[]
  /** Dismiss the dialog without creating anything. */
  onClose: () => void
  /** Submit the collected draft for creation. */
  onConfirm: (draft: AutomationDraft) => void
  /** The `automation` namespace dictionary. */
  t: TranslateNS<typeof NS>
}

/**
 * The add-task dialog. It owns the draft until confirm hands it to the page.
 * @param props - open state, the seed it starts from, the workspace catalog, close and confirm callbacks, locale seat.
 * @returns the modal tree, or null while closed.
 */
export function AutomationCreateModal({ open, seed, workspaces, onClose, onConfirm, t }: AutomationCreateModalProps) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [style, setStyle] = useState<CreateStyle>('balanced')
  const [frequency, setFrequency] = useState<CreateFrequency>('once')
  const [runAt, setRunAt] = useState('')
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<CreateIntervalUnit>('hour')
  const [validity, setValidity] = useState<CreateValidity>('forever')
  const [untilDate, setUntilDate] = useState('')
  const [pushWorkBuddy, setPushWorkBuddy] = useState(false)
  const [pushWecomBot, setPushWecomBot] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<CreateWorkspaceId | undefined>(undefined)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)

  // Re-open resets the draft to the seed it was opened with: the dialog is a
  // one-shot create form, and a template card is only a pre-filled starting point.
  useEffect(() => {
    if (!open) return
    setName(seed?.title ?? '')
    setPrompt(seed?.prompt ?? '')
    setStyle('balanced')
    setFrequency(seed?.frequency ?? 'once')
    setRunAt(seed?.runAt ?? '')
    setIntervalValue(seed?.intervalValue ?? 1)
    setIntervalUnit(seed?.intervalUnit ?? 'hour')
    setValidity('forever')
    setUntilDate('')
    setPushWorkBuddy(false)
    setPushWecomBot(false)
    setWorkspaceId(undefined)
    setWorkspaceOpen(false)
  }, [open, seed])

  if (!open) return null

  const draft: AutomationDraft = {
    title: name,
    prompt,
    frequency,
    runAt,
    intervalValue,
    intervalUnit,
    validity,
    untilDate,
    style,
    pushWorkBuddy,
    pushWecomBot,
    workspaceId,
  }
  const ready = draftReady(draft)
  const submit = (): void => {
    if (!ready) return
    onConfirm(draft)
  }
  const selected = workspaces.find(option => option.id === workspaceId)
  const workspaceItems: readonly MenuEntry[] = [
    { id: '', label: t('create.workspaceDefault') },
    ...workspaces.map(option => ({ id: option.id, label: option.label })),
  ]

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
            disabled={!ready}
            onClick={submit}
          >
            {t('create.confirm')}
          </button>
        </div>
      )}
    >
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); submit() }}>
        <label className={css.fieldLabel} htmlFor="sdkwork-automation-create-name">{t('create.nameLabel')}</label>
        <input
          id="sdkwork-automation-create-name"
          className={css.fieldInput}
          type="text"
          value={name}
          maxLength={MAX_TASK_NAME_LENGTH}
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
                value={style}
                onChange={(event) => { setStyle(event.target.value === 'precise' ? 'precise' : 'balanced') }}
              >
                <option value="balanced">{t('create.modelBalanced')}</option>
                <option value="precise">{t('create.modelPrecise')}</option>
              </select>
              <ChevronDownIcon size={12} className={css.pickChevron} />
            </span>
          </div>
        </div>
        <div className={css.scopeRow}>
          <Menu
            open={workspaceOpen}
            anchor={(
              <button
                type="button"
                className={css.scopeButton}
                aria-haspopup="menu"
                aria-expanded={workspaceOpen}
                onClick={() => { setWorkspaceOpen(prev => !prev) }}
              >
                <FolderIcon size={14} className={css.scopeIcon} />
                {selected?.label ?? t('create.workspace')}
                <ChevronDownIcon size={12} className={css.scopeChevron} />
              </button>
            )}
            items={workspaceItems}
            selectedId={workspaceId ?? ''}
            onSelect={(id) => {
              setWorkspaceId(id === '' ? undefined : id as CreateWorkspaceId)
              setWorkspaceOpen(false)
            }}
            onClose={() => { setWorkspaceOpen(false) }}
          />
          {/* Full workspace access is not a Schedule option yet; the control states
              that rather than collecting a choice the create request cannot carry. */}
          <button
            type="button"
            className={css.scopeButton}
            aria-disabled="true"
            title={t('create.fullAccessHint')}
          >
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
              onChange={(event) => { setFrequency((CREATE_FREQUENCIES as readonly string[]).includes(event.target.value) ? event.target.value as CreateFrequency : 'once') }}
            >
              {CREATE_FREQUENCIES.map(id => (
                <option key={id} value={id}>{t(frequencyKey(id))}</option>
              ))}
            </select>
            <ChevronDownIcon size={12} className={css.pickChevron} />
          </span>
          {frequency === 'interval' && (
            <>
              <input
                className={css.intervalInput}
                type="number"
                min={1}
                inputMode="numeric"
                aria-label={t('create.intervalValueAria')}
                value={intervalValue}
                onChange={(event) => { setIntervalValue(Number(event.target.value)) }}
              />
              <span className={css.pickShell}>
                <select
                  className={css.pick}
                  aria-label={t('create.intervalUnitAria')}
                  value={intervalUnit}
                  onChange={(event) => { setIntervalUnit(event.target.value === 'minute' ? 'minute' : 'hour') }}
                >
                  {CREATE_INTERVAL_UNITS.map(unit => (
                    <option key={unit} value={unit}>{t(intervalUnitKey(unit))}</option>
                  ))}
                </select>
                <ChevronDownIcon size={12} className={css.pickChevron} />
              </span>
            </>
          )}
          {TIMED_FREQUENCIES.includes(frequency) && (
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
        {frequency === 'interval' && intervalValue * (intervalUnit === 'hour' ? 3_600 : 60) < MIN_INTERVAL_SECONDS && (
          <p className={css.fieldHint} role="alert">{t('create.intervalHint')}</p>
        )}
        {validity === 'until' && <p className={css.fieldHint}>{t('create.validityUntilHint')}</p>}

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
