/**
 * The persona picker host: one `shell.overlay` entry rendering the role and
 * interest picker while the shared UI store says it is open. The frame's
 * overlay layer is click-through, so the dialog's own mask owns pointer events
 * while mounted; the entry renders nothing otherwise.
 *
 * The picker body mounts only while open, which is what reseeds the draft from
 * the durable choices on every open — no effect copies props into state.
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Modal, IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PersonaRoleId, PersonaSettings } from '../persona-settings.ts'
import type { PersonaInterestId } from './catalog.ts'
import type { PersonaCatalogSelection } from './persona-service.ts'
import type { createPersonaPickerStore } from './persona-ui-store.ts'
import css from './PersonaDialog.module.css'

/** Injected business face: the durable choices, the write path, and the dismiss gesture. */
export interface PersonaDialogInjected {
  /** Dismissal: closes the picker and records the prompt answer while no role is chosen. */
  onClose: () => void
  /**
   * Store one complete choice.
   * @param role - the chosen role.
   * @param interests - the chosen interest directions.
   * @returns whether the Host accepted the write.
   */
  save: (role: PersonaRoleId, interests: readonly PersonaInterestId[]) => Promise<boolean>
  hooks: {
    /** Durable choices (schema defaults until the scope resolves). */
    choices: HostObservable<PersonaSettings>
    /** Whether the section accepts writes. */
    writable: HostObservable<boolean>
    /** The ids the account catalog allows, in picker order. */
    catalog: HostObservable<PersonaCatalogSelection>
  }
}

/** Full component props: overlay owner share + store + injected face + locale seat. */
export type PersonaDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createPersonaPickerStore>>
  & InjectFace<PersonaDialogInjected>
  & PropsLocale<'uiPersona'>

/**
 * Render the picker while the store says it is open.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the dialog element tree, or null while closed.
 */
export function PersonaDialog(props: PersonaDialogProps) {
  const { useStore } = props
  const open = useStore(state => state.dialogOpen)
  return open ? <PersonaPicker {...props} /> : null
}

/**
 * The picker body: a draft over the durable choices, a role radio group, and
 * the multi-select interest directions. Saving writes one atomic mutation;
 * "later" is the same dismissal path as the close button.
 * @param props - composed slot props (the dialog's own props).
 * @returns the modal with the picker fields and actions.
 */
function PersonaPicker(props: PersonaDialogProps) {
  const { useChoices, useWritable, useCatalog, onClose, save, t } = props
  const choices = useChoices(value => value)
  const writable = useWritable(value => value)
  const catalog = useCatalog(value => value)
  const [role, setRole] = useState<PersonaRoleId | ''>(choices.role)
  const [interests, setInterests] = useState<readonly PersonaInterestId[]>(
    catalog.interestIds.filter(id => choices.interests.includes(id)),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const toggleInterest = (id: PersonaInterestId, checked: boolean): void => {
    setInterests((previous) => {
      const next = new Set(previous)
      if (checked) next.add(id)
      else next.delete(id)
      return catalog.interestIds.filter(candidate => next.has(candidate))
    })
  }

  const submit = async (): Promise<void> => {
    if (role === '') {
      setError(t('persona.roleRequired'))
      return
    }
    setError(undefined)
    setSaving(true)
    try {
      const accepted = await save(role, interests)
      if (accepted) onClose()
      else setError(t('persona.error'))
    } catch (_transportFailure) {
      // The settings transport refused the write (offline, stale revision, or
      // a Host refusal); the dialog stays open on the draft so a retry is one
      // click, and nothing was persisted.
      setError(t('persona.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('persona.title')}
      closeLabel={t('persona.close')}
      description={t('persona.description')}
      className={css.dialog}
      contentClassName={css.content}
      footer={(
        <div className={css.actions}>
          <button type="button" className={css.later} onClick={onClose} disabled={saving}>
            {t('persona.later')}
          </button>
          <button type="button" className={css.save} onClick={() => { void submit() }} disabled={saving || !writable}>
            {saving ? t('persona.saving') : t('persona.save')}
          </button>
        </div>
      )}
    >
      <fieldset className={css.fieldset}>
        <legend className={css.legend}>{t('persona.roleLegend')}</legend>
        <div className={css.roles}>
          {catalog.roleIds.map(id => (
            <label key={id} className={clsx(css.card, id === role && css.selected)}>
              <input
                type="radio"
                name="ui-sdkwork-persona-role"
                value={id}
                checked={id === role}
                onChange={() => { setRole(id) }}
                className={css.control}
              />
              {id === role && (
                <span className={css.cardCheck} aria-hidden="true"><IconCheckOutlineRegular size={12} /></span>
              )}
              <span className={css.cardTitle}>{t(`persona.role.${id}`)}</span>
              <span className={css.cardDescription}>{t(`persona.role.${id}.description`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={css.fieldset}>
        <legend className={css.legend}>
          {t('persona.interestLegend')}
          {interests.length > 0 && (
            <span className={css.count}>{t('persona.interestSelected', { count: interests.length })}</span>
          )}
        </legend>
        <p className={css.hint}>{t('persona.interestHint')}</p>
        <div className={css.interests}>
          {catalog.interestIds.map(id => (
            <label key={id} className={clsx(css.chip, interests.includes(id) && css.chipSelected)}>
              <input
                type="checkbox"
                value={id}
                checked={interests.includes(id)}
                onChange={(event) => { toggleInterest(id, event.target.checked) }}
                className={css.control}
              />
              {interests.includes(id) && <IconCheckOutlineRegular size={12} />}
              <span>{t(`persona.interest.${id}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {!writable && <p className={css.notice} role="status">{t('persona.readOnly')}</p>}
      {error !== undefined && <p className={css.error} role="alert">{error}</p>}
    </Modal>
  )
}
