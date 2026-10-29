/**
 * The Search page: the center-column surface for the `search` mode, keyed into
 * the frame's `mode.page` slot. A submit runs the plugin's SDKWork Search
 * runtime and renders the merged, grouped outcome; picking a hit hands it back
 * to the plugin, which switches the frame to the destination the catalog
 * resolved. The page owns only its query text, in-flight state, and last
 * outcome — every source and navigation decision stays in the plugin.
 */
import { useRef, useState } from 'react'
import type { SyntheticEvent } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge ('mode.page' owner share).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SearchResultGroup, SearchResultItem, SearchOutcome } from './searchRuntime.ts'
import css from './SearchPage.module.css'

/** Injected business face: the page's mode id and the plugin-owned query and navigation callbacks. */
export interface SearchPageInjected {
  /** The page's own mode id (the keyed registration's key). */
  readonly mode: 'search'
  /** Run one query through the SDKWork Search runtime. */
  readonly runSearch: (query: string) => Promise<SearchOutcome>
  /** Navigate to a hit's destination. */
  readonly openResult: (result: SearchResultItem) => void
}

/** Full component props: runtime share + injected face + the locale seat. */
export type SearchPageProps =
  PropsRuntime<'mode.page'>
  & SearchPageInjected
  & PropsLocale<'search'>

/** The page's query lifecycle. */
type SearchStatus = 'idle' | 'searching' | 'ready' | 'error'

/**
 * Render one result section.
 * @param group - the section to render.
 * @param openResult - navigation callback for a hit.
 * @param t - the plugin's locale lookup.
 * @returns the section element tree.
 */
function ResultSection(
  { group, openResult, t }: {
    group: SearchResultGroup
    openResult: (result: SearchResultItem) => void
    t: SearchPageProps['t']
  },
) {
  return (
    <section
      className={css.group}
      {...(group.heading === '' ? {} : { 'aria-label': group.heading })}
    >
      {group.heading !== '' && <h2 className={css.groupHeading}>{group.heading}</h2>}
      <ul className={css.list}>
        {group.results.map(result => (
          <li key={result.id} className={css.listItem}>
            <button
              type="button"
              className={css.result}
              disabled={result.destination === undefined}
              onClick={() => { openResult(result) }}
            >
              <span className={css.resultTitle}>{result.title}</span>
              {result.description !== undefined && (
                <span className={css.resultDescription}>{result.description}</span>
              )}
              <span className={css.resultOrigin}>
                {t(result.origin === 'local' ? 'origin.local' : 'origin.remote')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Render the Search page.
 * @param props - composed slot props (runtime share + injected face + locale seat).
 * @returns the page element tree.
 */
export function SearchPage({ mode, runSearch, openResult, t }: SearchPageProps) {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [outcome, setOutcome] = useState<SearchOutcome | undefined>(undefined)
  const requestSequence = useRef(0)

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const text = query.trim()
    if (text === '') return
    requestSequence.current += 1
    const sequence = requestSequence.current
    setSubmitted(text)
    setStatus('searching')
    setOutcome(undefined)
    void runSearch(text).then(
      (next) => {
        if (requestSequence.current !== sequence) return
        setOutcome(next)
        setStatus('ready')
      },
      () => {
        if (requestSequence.current !== sequence) return
        setOutcome(undefined)
        setStatus('error')
      },
    )
  }

  return (
    <div className={css.page} data-mode={mode} data-mode-page={mode} data-search-surface="sdkwork">
      <header className={css.header}>
        <h1 className={css.title}>{t('mode.search')}</h1>
        <p className={css.subtitle}>{t('page.subtitle')}</p>
        <form className={css.form} role="search" onSubmit={submit}>
          <input
            className={css.input}
            type="search"
            value={query}
            aria-label={t('input.label')}
            placeholder={t('input.placeholder')}
            onChange={(event) => { setQuery(event.target.value) }}
          />
          <button type="submit" className={css.submit} disabled={query.trim() === ''}>
            {t('input.submit')}
          </button>
        </form>
      </header>
      <div className={css.status} role="status" aria-live="polite">
        {status === 'idle' && <p className={css.hint}>{t('status.idle')}</p>}
        {status === 'searching' && <p className={css.hint}>{t('status.searching')}</p>}
        {status === 'ready' && outcome !== undefined && (
          <p className={css.hint}>{t('status.results', { count: outcome.total })}</p>
        )}
      </div>
      {status === 'ready' && outcome?.degraded === true && (
        <p className={css.notice}>{t('status.degraded')}</p>
      )}
      {status === 'error' && <p className={css.error} role="alert">{t('status.error')}</p>}
      {status === 'ready' && outcome !== undefined && outcome.total === 0 && (
        <p className={css.empty}>{t('status.empty', { query: submitted })}</p>
      )}
      <div className={css.results}>
        {outcome?.groups.map(group => (
          <ResultSection key={group.id} group={group} openResult={openResult} t={t} />
        ))}
      </div>
    </div>
  )
}
