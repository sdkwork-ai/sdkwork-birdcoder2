import { useEffect, useState } from 'react'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { VideoGenerationSnapshot } from './generations-service.ts'
import css from './GenerationsPage.module.css'

/** Injected video generation page data and observable request state. */
export interface VideoGenerationsPageInjected {
  /** The keyed mode id owned by this page. */
  mode: 'video'
  /** Start a video generation request for a prompt. */
  generate(prompt: string): void
  hooks: {
    /** Live video generation request and result state. */
    generation: HostObservable<VideoGenerationSnapshot>
  }
}

/** Composed video generation page props. */
export type VideoGenerationsPageProps =
  PropsRuntime<'mode.page'>
  & InjectFace<VideoGenerationsPageInjected>
  & PropsLocale<'generationsVideo'>

/**
 * Render the SDKWork Agents video generation surface: the video generation
 * input (a prompt composer) and the resulting video player.
 * @param props - runtime data, generation callback and hook, and locale seat.
 * @returns the video generation page.
 */
export function VideoGenerationsPage({ mode, generate, useGeneration, t }: VideoGenerationsPageProps) {
  const generation = useGeneration(snapshot => snapshot)
  const [draft, setDraft] = useState(generation.prompt)

  useEffect(() => {
    setDraft(generation.prompt)
  }, [generation.prompt])

  const submit = (event: { preventDefault(): void }): void => {
    event.preventDefault()
    const prompt = draft.trim()
    setDraft(prompt)
    if (prompt !== '') generate(prompt)
  }

  return (
    <main className={css.page} data-mode={mode} data-mode-page={mode}>
      <div className={css.content}>
        <header className={css.header}>
          <h1 className={css.title}>{t('page.title')}</h1>
          <p className={css.subtitle}>{t('page.subtitle')}</p>
        </header>

        <form className={css.composer} aria-label={t('page.input')} onSubmit={submit}>
          <textarea
            className={css.prompt}
            aria-label={t('page.prompt')}
            placeholder={t('page.prompt.placeholder')}
            value={draft}
            onChange={(event) => { setDraft(event.target.value) }}
            rows={4}
          />
          <button
            type="submit"
            className={css.button}
            disabled={generation.status === 'generating' || draft.trim() === ''}
          >
            {t('page.generate')}
          </button>
        </form>

        {generation.status === 'unconfigured' && (
          <p className={css.status} role="status">{t('page.configure')}</p>
        )}
        {generation.status === 'generating' && (
          <p className={css.status} role="status">{t('page.generating')}</p>
        )}
        {generation.status === 'error' && (
          <div className={css.status} role="alert">
            <p className={css.error}>{t('page.error')}</p>
            <button type="button" className={css.button} onClick={() => { generate(generation.prompt) }}>
              {t('page.retry')}
            </button>
          </div>
        )}
        {generation.status === 'ready' && (
          <section className={css.section} aria-labelledby="video-generation-results-title">
            <h2 id="video-generation-results-title" className={css.sectionTitle}>{t('page.results')}</h2>
            {generation.results.length === 0
              ? <p className={css.status}>{t('page.empty')}</p>
              : (
                <div className={css.list}>
                  {generation.results.map(result => (
                    <video key={result.url} className={css.result} src={result.url} controls />
                  ))}
                </div>
              )}
          </section>
        )}
      </div>
    </main>
  )
}
