/**
 * The plugin source dialog: one form that describes where a plugin package
 * comes from, for the two flows that used to have no source vocabulary of
 * their own.
 *
 * - **Create plugin** records the plugin's name, summary, and source, so the
 *   creation conversation starts from the standard package and the place the
 *   person wants it published instead of guessing both.
 * - **Install plugin** turns the same source into the install spec the plugin
 *   manager accepts and runs it, so an archive, a Git directory, or a
 *   sdkwork-drive directory installs exactly like a registry package.
 *
 * The form validates through the shared source standard, so a browser refusal
 * and a Host refusal read the same and a directory can never point outside the
 * source. Every form keeps the plugin's directory: a repository that publishes
 * several plugins is addressed by path, not by a separate repository.
 */
import { useEffect, useRef, useState } from 'react'
import {
  InvalidPluginSourceError, parsePluginSource, pluginSourceSpec,
  type PluginSource, type PluginSourceKind,
} from '@deepseek-ai/dsh-plugin-manager/source'
import type { MarketsKey } from './locales.ts'
import css from './MarketDialog.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey, params?: Record<string, string>) => string

/** Which flow opened the dialog. */
export type PluginSourceMode = 'create' | 'install'

/** One validated source, handed to the flow that opened the dialog. */
export interface PluginSourceSubmission {
  /** The normalized source. */
  readonly source: PluginSource
  /** The install spec `plugin_manager` accepts. */
  readonly spec: string
  /** The plugin name the creation form recorded. */
  readonly name?: string
  /** The plugin summary the creation form recorded. */
  readonly description?: string
}

/** Full props for the dialog. */
export interface PluginSourceDialogProps {
  /** The locale seat. */
  readonly t: Translate
  /** Create a plugin, or install one from its source. */
  readonly mode: PluginSourceMode
  /** Hand the validated source to the caller (the dialog closes itself). */
  readonly onSubmit: (submission: PluginSourceSubmission) => void
  /** Create with the guided conversation instead, when the caller offers it. */
  readonly onGuided?: () => void
  /** Dismiss without submitting. */
  readonly onClose: () => void
}

/** The source forms, in chip order. */
const KINDS: readonly PluginSourceKind[] = ['git', 'archive', 'drive']

/** Each form's chip copy. */
const KIND_KEYS = {
  git: 'source.kind.git',
  archive: 'source.kind.archive',
  drive: 'source.kind.drive',
} as const satisfies Record<PluginSourceKind, MarketsKey>

/** Each form's address copy and placeholder. */
const URL_KEYS = {
  git: { label: 'source.url.git', placeholder: 'source.url.git.placeholder' },
  archive: { label: 'source.url.archive', placeholder: 'source.url.archive.placeholder' },
  drive: { label: 'source.url.drive', placeholder: 'source.url.drive.placeholder' },
} as const satisfies Record<PluginSourceKind, { label: MarketsKey; placeholder: MarketsKey }>

/**
 * Read a source refusal as the field it belongs to.
 * @param error - the standard's refusal.
 * @returns the locale key that names the field.
 */
function validationKey(error: unknown): MarketsKey {
  if (!(error instanceof InvalidPluginSourceError)) return 'source.error.invalid'
  if (/directory/i.test(error.reason)) return 'source.error.directory'
  if (/hash|sha-256|sha256/i.test(error.reason)) return 'source.error.hash'
  if (/ref/i.test(error.reason)) return 'source.error.ref'
  if (/URL|credential|repository|node/i.test(error.reason)) return 'source.error.url'
  return 'source.error.invalid'
}

/**
 * Render the plugin source form.
 * @param props - see {@link PluginSourceDialogProps}.
 * @returns the dialog element tree.
 */
export function PluginSourceDialog({
  t, mode, onSubmit, onGuided, onClose,
}: PluginSourceDialogProps) {
  const [kind, setKind] = useState<PluginSourceKind>('git')
  const [url, setUrl] = useState('')
  const [ref, setRef] = useState('')
  const [directory, setDirectory] = useState('')
  const [sha256, setSha256] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<MarketsKey | undefined>(undefined)
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const create = mode === 'create'
  const title = t(create ? 'source.title.create' : 'source.title.install')
  const address = URL_KEYS[kind]
  const canSubmit = url.trim() !== '' && (!create || name.trim() !== '')

  const submit = (): void => {
    setError(undefined)
    let source: PluginSource
    try {
      source = parsePluginSource({
        kind,
        url,
        ...(kind === 'git' && ref.trim() !== '' ? { ref } : {}),
        ...(directory.trim() !== '' ? { directory } : {}),
        ...(kind === 'archive' && sha256.trim() !== '' ? { sha256 } : {}),
      })
    } catch (refusal) {
      setError(validationKey(refusal))
      return
    }
    onSubmit({
      source,
      spec: pluginSourceSpec(source),
      ...(create && name.trim() !== '' ? { name: name.trim() } : {}),
      ...(create && description.trim() !== '' ? { description: description.trim() } : {}),
    })
  }

  return (
    <div
      className={css.overlay}
      role="presentation"
      onPointerDown={(event) => {
        if (card.current !== null && !card.current.contains(event.target as Node)) onClose()
      }}
    >
      <div className={css.card} ref={card} role="dialog" aria-modal="true" aria-label={title} data-plugin-source-dialog={mode}>
        <button type="button" className={css.close} aria-label={t('dialog.close')} onClick={onClose}>×</button>
        <h2 className={css.title}>{title}</h2>
        <p className={css.hint}>{t(create ? 'source.hint.create' : 'source.hint.install')}</p>
        <form
          className={css.form}
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) submit()
          }}
        >
          {create && (
            <>
              <label className={css.field}>
                <span className={css.label}>{t('source.name')}</span>
                <input
                  className={css.input}
                  type="text"
                  value={name}
                  placeholder={t('source.name.placeholder')}
                  aria-label={t('source.name')}
                  autoFocus
                  onChange={(event) => { setName(event.target.value) }}
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>{t('source.description')}</span>
                <textarea
                  className={css.input}
                  rows={2}
                  value={description}
                  placeholder={t('source.description.placeholder')}
                  aria-label={t('source.description')}
                  onChange={(event) => { setDescription(event.target.value) }}
                />
              </label>
            </>
          )}
          <div className={css.field}>
            <span className={css.label}>{t('source.kind')}</span>
            <div className={css.chips} role="group" aria-label={t('source.kind')}>
              {KINDS.map(value => (
                <button
                  key={value}
                  type="button"
                  className={`${css.chip}${kind === value ? ` ${css.chipActive}` : ''}`}
                  aria-pressed={kind === value}
                  data-plugin-source-kind={value}
                  onClick={() => {
                    setKind(value)
                    setError(undefined)
                  }}
                >
                  {t(KIND_KEYS[value])}
                </button>
              ))}
            </div>
          </div>
          <label className={css.field}>
            <span className={css.label}>{t(address.label)}</span>
            <input
              className={css.input}
              type="text"
              value={url}
              placeholder={t(address.placeholder)}
              aria-label={t(address.label)}
              {...create ? {} : { autoFocus: true }}
              onChange={(event) => { setUrl(event.target.value) }}
            />
          </label>
          {kind === 'git' && (
            <label className={css.field}>
              <span className={css.label}>{t('source.ref')}</span>
              <input
                className={css.input}
                type="text"
                value={ref}
                placeholder={t('source.ref.placeholder')}
                aria-label={t('source.ref')}
                onChange={(event) => { setRef(event.target.value) }}
              />
            </label>
          )}
          {kind === 'archive' && (
            <label className={css.field}>
              <span className={css.label}>{t('source.sha256')}</span>
              <input
                className={css.input}
                type="text"
                value={sha256}
                placeholder={t('source.sha256.placeholder')}
                aria-label={t('source.sha256')}
                onChange={(event) => { setSha256(event.target.value) }}
              />
            </label>
          )}
          <label className={css.field}>
            <span className={css.label}>{t('source.directory')}</span>
            <input
              className={css.input}
              type="text"
              value={directory}
              placeholder={t('source.directory.placeholder')}
              aria-label={t('source.directory')}
              onChange={(event) => { setDirectory(event.target.value) }}
            />
          </label>
          {error !== undefined && <p className={css.error} role="alert">{t(error)}</p>}
          <div className={css.footer}>
            {create && onGuided !== undefined && (
              <button type="button" className={css.guided} onClick={onGuided}>
                {t('source.guided')}
              </button>
            )}
            <button type="button" className={css.cancel} onClick={onClose}>{t('dialog.cancel')}</button>
            <button
              type="submit"
              className={css.submit}
              disabled={!canSubmit}
              data-plugin-source-submit={mode}
            >
              {t(create ? 'source.create' : 'source.install')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
