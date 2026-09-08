/**
 * The import-skill dialog: the modal that accepts a skill package — drag &
 * drop or click to pick a folder/zip/.md file — with the "install
 * non-high-risk automatically" gate, and submits it as one composed prompt
 * into a fresh conversation (the harness's execution channel; no direct host
 * skill-install API exists yet, so the entry rides the same dispatch as the
 * other flows). Escape, the close button, and an overlay click dismiss; the
 * submit stays gated on a picked file.
 */
import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { MarketsKey } from './locales.ts'
import { skillImportPrompt } from './skillPrompts.ts'
import { UploadIcon } from './icons.tsx'
import css from './ImportSkillDialog.module.css'

/** Translate seat (the locale render currency, keys rendered verbatim in tests). */
type Translate = (key: MarketsKey) => string

/** Full props for the dialog. */
export interface ImportSkillDialogProps {
  /** The locale seat. */
  t: Translate
  /** Submit the composed import prompt (the dialog closes itself). */
  onSubmit: (text: string) => void
  /** Dismiss without submitting. */
  onClose: () => void
}

/** The file picker's accepted extensions (folders pick through the same input). */
const ACCEPT = '.zip,.md'

/**
 * Render the modal form.
 * @param props - the locale seat plus the submit and dismiss callbacks.
 * @returns the dialog element tree.
 */
export function ImportSkillDialog({ t, onSubmit, onClose }: ImportSkillDialogProps) {
  const [file, setFile] = useState<File | undefined>(undefined)
  const [autoInstall, setAutoInstall] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  // Escape dismisses; the overlay's own pointerdown dismisses too (a
  // pointerdown that starts inside the card does not).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const pick = (picked: File | undefined): void => {
    if (picked !== undefined) setFile(picked)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragOver(false)
    pick(event.dataTransfer.files[0])
  }

  return (
    <div
      className={css.overlay}
      role="presentation"
      onPointerDown={(e) => {
        if (card.current !== null && !card.current.contains(e.target as Node)) onClose()
      }}
    >
      <div className={css.card} ref={card} role="dialog" aria-modal="true" aria-label={t('dialog.skill.title')}>
        <button type="button" className={css.close} aria-label={t('dialog.close')} onClick={onClose}>×</button>
        <h2 className={css.title}>{t('dialog.skill.title')}</h2>
        <div
          className={css.dropzone}
          data-drag-over={dragOver || undefined}
          role="button"
          tabIndex={0}
          aria-label={t('dialog.skill.dropzone')}
          onClick={() => { input.current?.click() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => { setDragOver(false) }}
          onDrop={onDrop}
        >
          <UploadIcon size={26} className={css.dropzoneIcon} />
          <span className={css.dropzoneText}>
            {file === undefined ? t('dialog.skill.dropzone') : file.name}
          </span>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          // webkitdirectory lets folder picks through (a skill package is a
          // folder carrying SKILL.md); the accept filter still guides file picks.
          // @ts-expect-error -- non-standard attribute, TS DOM lib lacks it
          webkitdirectory=""
          className={css.hiddenInput}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
        />
        <label className={css.gate}>
          <input
            type="checkbox"
            className={css.gateBox}
            checked={autoInstall}
            onChange={(e) => { setAutoInstall(e.target.checked) }}
          />
          {t('dialog.skill.auto')}
        </label>
        <div className={css.requirements}>
          <p className={css.requirementsTitle}>{t('dialog.skill.requirements')}</p>
          <ul className={css.requirementsList}>
            <li>{t('dialog.skill.req.zip')}</li>
            <li>{t('dialog.skill.req.md')}</li>
          </ul>
          <button
            type="button"
            className={css.zipLink}
            onClick={() => {
              const zip = document.createElement('input')
              zip.type = 'file'
              zip.accept = '.zip'
              zip.onchange = () => { pick(zip.files?.[0]); zip.remove() }
              zip.click()
            }}
          >
            {t('dialog.skill.zip.link')}
          </button>
        </div>
        <div className={css.footer}>
          <button type="button" className={css.cancel} onClick={onClose}>{t('dialog.cancel')}</button>
          <button
            type="button"
            className={css.submit}
            disabled={file === undefined}
            onClick={() => {
              if (file === undefined) return
              onSubmit(skillImportPrompt(t, file.name, autoInstall))
            }}
          >
            {t('dialog.skill.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
