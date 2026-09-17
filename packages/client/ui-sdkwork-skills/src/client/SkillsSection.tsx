/**
 * The Skills settings page: the skill manager.
 *
 * A section, not a dialog, because that is the shape the settings shell
 * already has: contributing one `settings.section` puts a row in the nav rail
 * and a page in the content column, and the shell keeps zero knowledge of what
 * a skill is.
 *
 * Reading order matches the work. The summary answers "how many are on" before
 * anything is scrolled; the groups put the 35 built-ins where a reader expects
 * them (the same code / media / document split the new-session tag strip uses)
 * and push everything else into one honest bucket; the row keeps the switch at
 * the far right, where a column of switches can be scanned without reading.
 * Disclosure is page-local state: which row is open is a reading gesture, not a
 * fact the Host or the section has any stake in.
 *
 * Every value here is catalog data or a projection of the durable preference —
 * the page never guesses. A write that the Host refuses shows up as the switch
 * returning to its stored position, because the switch renders `disabled` from
 * the scope snapshot rather than from a local copy of the click.
 */

import { useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconChevronDownOutline14, IconCloseOutline16, IconSearchOutline16, IconSkillOutline16, Input, Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings.section slot declaration this component is mounted from.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSkillsSectionStore, type SkillCatalogRow } from './skills-store.ts'
import { SKILL_GROUP_ORDER, SKILL_SCENES, skillGroupSlot, type SkillGroupSlot } from './skill-scenes.ts'
import type { SkillsKey } from './locales.ts'
import css from './SkillsSection.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The skill manager's page copy and scene aliases. */
    sdkworkSkills: SkillsKey
  }
}

/** Registration-side business face: the two preference writes and a catalog reload. */
export interface SkillsSectionInjected {
  /**
   * Persist whether one skill is available at all.
   * @param name - the skill's catalog name.
   * @param enabled - whether the skill stays available.
   */
  setEnabled: (name: string, enabled: boolean) => void
  /**
   * Persist whether one skill is suggested in a new session.
   * @param name - the skill's catalog name.
   * @param hidden - whether the skill is kept out of the tag strip.
   */
  setTagHidden: (name: string, hidden: boolean) => void
  /** Refetch the catalog for the current session. */
  reload: () => void
}

/** Full component props: section runtime share + store share + injected face + locale seat. */
export type SkillsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsStore<ReturnType<typeof createSkillsSectionStore>>
  & InjectFace<SkillsSectionInjected>
  & PropsLocale<'sdkworkSkills'>

/** The locale seat's translate function. */
type SkillsTranslate = PropsLocale<'sdkworkSkills'>['t']

/**
 * The name a row reads as: the scenario alias when the built-in table knows the
 * skill, its own catalog name otherwise. The raw name is always shown too — it
 * is the token the user types, so hiding it would make the row unsearchable by
 * the thing the user actually remembers.
 * @param row - the catalog row.
 * @param t - the bound translate.
 * @returns the alias, or undefined when the table has no entry.
 */
function aliasOf(row: SkillCatalogRow, t: SkillsTranslate): string | undefined {
  const scene = SKILL_SCENES[row.name]
  return scene === undefined ? undefined : t(scene.labelKey)
}

/** One row's rendering inputs, gathered so the row stays a pure projection. */
interface SkillRowViewProps {
  row: SkillCatalogRow
  /** Whether the skill is suppressed. */
  disabled: boolean
  /** Whether the skill is kept out of the new-session tag strip. */
  tagHidden: boolean
  /** Whether either of this row's writes is in flight. */
  busy: boolean
  /** Whether the settings document accepts writes. */
  writable: boolean
  /** Whether the row is disclosed. */
  expanded: boolean
  /** Whether the skill is a built-in with a strip seat (only those get the tag switch). */
  hasTagSeat: boolean
  onToggleExpanded: () => void
  onToggleEnabled: (enabled: boolean) => void
  onToggleTagHidden: (hidden: boolean) => void
  t: SkillsTranslate
}

/**
 * Render one catalog row: the disclosure affordance, the skill's identity, the
 * enable switch, and — while disclosed — the read-only facts and the suggestion
 * switch.
 * @param props - the row's inputs.
 * @returns the row element tree.
 */
function SkillRowView({
  row, disabled, tagHidden, busy, writable, expanded, hasTagSeat,
  onToggleExpanded, onToggleEnabled, onToggleTagHidden, t,
}: SkillRowViewProps): ReactNode {
  const alias = aliasOf(row, t)
  const panelId = `sdkwork-skill-details-${row.name}`
  return (
    <li className={clsx(css.row, disabled && css.rowDisabled)} data-skill={row.name}>
      <div className={css.rowMain}>
        <button
          type="button"
          className={css.rowButton}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={expanded ? t('row.collapse') : t('row.expand')}
          onClick={onToggleExpanded}
        >
          <span className={css.rowIcon} aria-hidden="true">
            <IconSkillOutline16 size={16} />
          </span>
          <span className={css.rowCopy}>
            <span className={css.rowTitle}>
              {alias !== undefined && <span className={css.rowAlias}>{alias}</span>}
              <code className={css.rowName}>/{row.name}</code>
            </span>
            <span className={css.rowDescription}>{row.description}</span>
          </span>
          <IconChevronDownOutline14
            size={14}
            className={clsx(css.chevron, expanded && css.chevronOpen)}
          />
        </button>
        <Switch
          checked={!disabled}
          disabled={!writable || busy}
          label={alias ?? row.name}
          onChange={onToggleEnabled}
        />
      </div>
      {expanded && (
        <div className={css.details} id={panelId}>
          <dl className={css.facts}>
            <dt className={css.factLabel}>{t('row.field.invoke')}</dt>
            <dd className={css.factValue}>
              {row.modelInvocable ? t('row.field.invoke.model') : t('row.field.invoke.user')}
            </dd>
            {row.whenToUse !== undefined && (
              <>
                <dt className={css.factLabel}>{t('row.field.whenToUse')}</dt>
                <dd className={css.factValue}>{row.whenToUse}</dd>
              </>
            )}
            <dt className={css.factLabel}>{t('row.field.description')}</dt>
            <dd className={css.factValue}>{row.description}</dd>
          </dl>
          {hasTagSeat && (
            <div className={css.tagRow}>
              <div className={css.tagCopy}>
                <div className={css.tagTitle}>{t('row.tag.on')}</div>
                <p className={css.tagHint}>{t('row.tagHint')}</p>
              </div>
              <Switch
                checked={!tagHidden}
                disabled={!writable || busy}
                label={`${alias ?? row.name} · ${t('row.tag.on')}`}
                onChange={(next) => { onToggleTagHidden(!next) }}
              />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/** One rendered group: the slot, its heading key, and the rows under it. */
interface SkillGroupView {
  slot: SkillGroupSlot
  items: readonly SkillCatalogRow[]
}

/**
 * Render the Skills section content column.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the section element tree.
 */
export function SkillsSection({
  useStore, setEnabled, setTagHidden, reload, t,
}: SkillsSectionProps): ReactNode {
  const status = useStore(s => s.status)
  const rows = useStore(s => s.rows)
  const disabled = useStore(s => s.disabled)
  const hiddenTags = useStore(s => s.hiddenTags)
  const writable = useStore(s => s.writable)
  const pending = useStore(s => s.pending)

  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const disabledNames = useMemo(() => new Set(disabled), [disabled])
  const hiddenNames = useMemo(() => new Set(hiddenTags), [hiddenTags])
  const busyNames = useMemo(() => new Set(pending), [pending])

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return rows
    return rows.filter((row) => {
      const alias = aliasOf(row, t)
      return row.name.toLowerCase().includes(needle)
        || row.description.toLowerCase().includes(needle)
        || (alias !== undefined && alias.toLowerCase().includes(needle))
    })
  }, [rows, query, t])

  const groups = useMemo<readonly SkillGroupView[]>(() => SKILL_GROUP_ORDER
    .map(entry => ({
      slot: entry.slot,
      items: matched.filter(row => skillGroupSlot(row.name) === entry.slot),
    }))
    .filter(entry => entry.items.length > 0), [matched])

  const enabledCount = useMemo(
    () => rows.reduce((total, row) => (disabledNames.has(row.name) ? total : total + 1), 0),
    [rows, disabledNames],
  )

  const toggleExpanded = (name: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const setGroup = (items: readonly SkillCatalogRow[], enabled: boolean): void => {
    for (const row of items) {
      if (writable && !busyNames.has(row.name)) setEnabled(row.name, enabled)
    }
  }

  return (
    <div className={css.section}>
      <h2 className={css.heading}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      <div className={css.toolbar}>
        <Input
          className={css.search}
          type="search"
          value={query}
          icon={<IconSearchOutline16 size={14} />}
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          onChange={(event) => { setQuery(event.target.value) }}
        />
        {query !== '' && (
          <button
            type="button"
            className={css.clear}
            aria-label={t('search.clear')}
            onClick={() => { setQuery('') }}
          >
            <IconCloseOutline16 size={12} />
          </button>
        )}
        <button
          type="button"
          className={css.reload}
          disabled={status === 'loading'}
          onClick={reload}
        >
          {t('reload')}
        </button>
        <div className={css.summary}>
          <span className={css.summaryLabel}>{t('summary.label')}</span>
          <strong className={css.summaryValue}>{enabledCount}</strong>
          <span className={css.summaryTotal}>{t('summary.total')} {rows.length} {t('summary.unit')}</span>
        </div>
      </div>

      {status === 'ready' && !writable && (
        <p className={css.notice}>{t('state.readOnly')}</p>
      )}

      {status === 'idle' && <p className={css.state}>{t('state.noSession')}</p>}
      {status === 'loading' && rows.length === 0 && <p className={css.state}>{t('state.loading')}</p>}
      {status === 'error' && (
        <div className={css.state} role="alert">
          <p className={css.stateText}>{t('state.error')}</p>
          <button type="button" className={css.retry} onClick={reload}>{t('state.retry')}</button>
        </div>
      )}
      {status === 'ready' && rows.length === 0 && <p className={css.state}>{t('state.empty')}</p>}
      {status !== 'loading' && rows.length > 0 && matched.length === 0 && (
        <p className={css.state}>{t('state.noMatch')}</p>
      )}

      {groups.map(group => (
        <section key={group.slot} className={css.group} aria-label={t(SKILL_GROUP_ORDER.find(e => e.slot === group.slot)?.labelKey ?? 'group.other')}>
          <div className={css.groupHeader}>
            <h3 className={css.groupTitle}>
              {t(SKILL_GROUP_ORDER.find(e => e.slot === group.slot)?.labelKey ?? 'group.other')}
            </h3>
            <span className={css.groupCount}>{group.items.length} {t('group.count')}</span>
            <div className={css.groupActions}>
              <button
                type="button"
                className={css.groupAction}
                disabled={!writable}
                onClick={() => { setGroup(group.items, true) }}
              >
                {t('group.enableAll')}
              </button>
              <button
                type="button"
                className={css.groupAction}
                disabled={!writable}
                onClick={() => { setGroup(group.items, false) }}
              >
                {t('group.disableAll')}
              </button>
            </div>
          </div>
          <ul className={css.list}>
            {group.items.map(row => (
              <SkillRowView
                key={row.name}
                row={row}
                disabled={disabledNames.has(row.name)}
                tagHidden={hiddenNames.has(row.name)}
                busy={busyNames.has(row.name)}
                writable={writable}
                expanded={expanded.has(row.name)}
                hasTagSeat={SKILL_SCENES[row.name] !== undefined}
                onToggleExpanded={() => { toggleExpanded(row.name) }}
                onToggleEnabled={(next) => { setEnabled(row.name, next) }}
                onToggleTagHidden={(next) => { setTagHidden(row.name, next) }}
                t={t}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
