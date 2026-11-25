/**
 * The "导入到" dialog.
 *
 * One target per dialog: the console's menu row decides the target, the form
 * decides the provider name / model / protocol, and every file below is a pure
 * projection of those choices. The CC Switch link carries the same import in
 * CC Switch's own format, so a user who has CC Switch can let it perform the
 * writes instead of running the install command.
 *
 * @module @deepseek-ai/dsh-client-ui-sdkwork-import-to
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ApiFormat, ImportFile, ImportPlan, TargetPlatform } from '../types.ts'
import { apiFormatFrom, isImportTargetId, targetById } from '../targets.ts'
import { detectPlatform, platformPaths } from '../platform.ts'
import { planImport } from '../ccSwitch/project.ts'
import { fillTitle, importToCopy, type ImportToCopy } from '../locales.ts'
import type { QuickImportExtensionSelection } from '../extension.tsx'
import { baseName, copyText, downloadText } from './transfer.ts'

const SCRIM = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483000,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  boxSizing: 'border-box',
} as const

const PANEL = {
  width: 'min(880px, 94vw)',
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--sdkwork-panel-bg, #fff)',
  color: 'var(--sdkwork-panel-fg, #0f172a)',
  borderRadius: 12,
  boxShadow: '0 24px 64px rgba(15, 23, 42, 0.28)',
  overflow: 'hidden',
  font: '13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
} as const

const HEADER = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  padding: '16px 20px 8px',
} as const

const BODY = {
  padding: '4px 20px 16px',
  overflowY: 'auto',
} as const

const FOOTER = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  padding: '12px 20px',
  borderTop: '1px solid rgba(15, 23, 42, 0.08)',
} as const

const CARD = {
  border: '1px solid rgba(15, 23, 42, 0.1)',
  borderRadius: 8,
  padding: 12,
  marginBottom: 12,
  background: 'rgba(15, 23, 42, 0.015)',
} as const

const CODE = {
  margin: '8px 0 0',
  padding: 10,
  maxHeight: 260,
  overflow: 'auto',
  borderRadius: 6,
  background: 'rgba(15, 23, 42, 0.05)',
  font: '12px/1.45 ui-monospace, "Cascadia Code", Consolas, monospace',
  whiteSpace: 'pre',
} as const

const BUTTON = {
  appearance: 'none',
  border: '1px solid rgba(15, 23, 42, 0.16)',
  borderRadius: 6,
  background: '#fff',
  color: 'inherit',
  padding: '5px 10px',
  font: 'inherit',
  cursor: 'pointer',
} as const

const PRIMARY = {
  ...BUTTON,
  background: '#2563eb',
  borderColor: '#2563eb',
  color: '#fff',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
} as const

const FIELD = {
  display: 'grid',
  gridTemplateColumns: '84px 1fr',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
} as const

const INPUT = {
  border: '1px solid rgba(15, 23, 42, 0.16)',
  borderRadius: 6,
  padding: '6px 8px',
  font: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
} as const

/** Props of {@link ImportToDialog}. */
interface ImportToDialogProps {
  readonly selection: QuickImportExtensionSelection
  readonly onClose: () => void
  /** Host platform for the projected paths; the browser's own by default. */
  readonly platform?: TargetPlatform
  /** The client's active locale id; the browser's language by default. */
  readonly language?: string
}

/**
 * Card for one planned file.
 * @param props - file, dialog copy, platform separator, copy action.
 * @returns the card.
 */
function PlanFileCard(props: {
  readonly file: ImportFile
  readonly copy: (text: string, done: string) => void
  readonly copied: string
  readonly t: ImportToCopy
  readonly separator: '\\' | '/'
}): ReactElement {
  const { file, copy, copied, t, separator } = props
  const fileName = baseName(file.path, separator)
  const fragmentShown = file.fragment !== undefined && file.fragment !== file.content
  return (
    <div style={CARD} data-import-to-file={file.path}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ wordBreak: 'break-all' }}>{file.path}</strong>
        <span style={{ ...BUTTON, cursor: 'default', opacity: 0.75 }}>{file.write}</span>
        <span style={{ flex: '1 1 auto' }} />
        <button type="button" style={BUTTON} onClick={() =>{  copy(file.content, copied) }}>
          {t.copyAction}
        </button>
        <button type="button" style={BUTTON} onClick={() =>{  downloadText(fileName, file.content) }}>
          {t.downloadAction}
        </button>
      </div>
      {file.managedKeys.length > 0 ? (
        <div style={{ marginTop: 6, opacity: 0.75, font: '12px/1.4 ui-monospace, Consolas, monospace' }}>
          {file.managedKeys.join(', ')}
        </div>
      ) : null}
      <pre style={CODE}>{file.content}</pre>
      {fragmentShown ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer' }}>{t.fragmentHeading}</summary>
          <pre style={CODE}>{file.fragment}</pre>
        </details>
      ) : null}
      {file.note === undefined ? null : (
        <div style={{ marginTop: 6, opacity: 0.7 }}>
          {file.note}
        </div>
      )}
    </div>
  )
}

/**
 * Import dialog for one menu selection.
 * @param props - selection and close callback.
 * @returns the dialog, or `null` when the target id is unknown.
 */
export function ImportToDialog({ selection, onClose, platform: platformProp, language }: ImportToDialogProps): ReactElement | null {
  const t = importToCopy(language)
  const platform = platformProp ?? detectPlatform()
  const separator = platform === 'win32' ? '\\' : '/'
  const target = isImportTargetId(selection.targetId) ? targetById(selection.targetId) : null
  const [name, setName] = useState(selection.key.displayName)
  const [model, setModel] = useState('')
  const [format, setFormat] = useState<ApiFormat>(target?.defaultApiFormat ?? 'openai_chat')
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () =>{  document.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  const plan = useMemo<ImportPlan | null>(() => {
    if (target === null || name.trim() === '') return null
    try {
      return planImport(target.id, {
        name: name.trim(),
        apiKey: selection.key.rawKey,
        model: model.trim() === '' ? undefined : model.trim(),
        apiFormat: format,
        endpoints: selection.endpoints,
        platform: platformPaths(platform),
        homepage: selection.homepage,
      })
    } catch (error) {
      if (error instanceof TypeError) return null
      throw error
    }
  }, [target, format, name, model, selection, platform])

  if (target === null) return null

  const copy = async (text: string, done: string): Promise<void> => {
    const ok = await copyText(text)
    setFeedback(ok ? done : null)
  }

  return (
    <div
      style={SCRIM}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={PANEL}
        role="dialog"
        aria-modal="true"
        aria-label={fillTitle(t.title, target.label)}
      >
        <div style={HEADER}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>
              {fillTitle(t.title, target.label)}
            </div>
            <div style={{ opacity: 0.7, marginTop: 2 }}>{t.subtitle}</div>
          </div>
          <button type="button" style={BUTTON} onClick={onClose} aria-label={t.closeAction}>
            {'×'}
          </button>
        </div>
        <div style={BODY}>
          <div style={FIELD}>
            <span>{t.nameLabel}</span>
            <input
              style={INPUT}
              value={name}
              onChange={(event) =>{  setName(event.target.value) }}
            />
          </div>
          <div style={FIELD}>
            <span>
              {t.modelLabel}
              {target.requiresModel ? ' *' : null}
            </span>
            <input
              style={INPUT}
              value={model}
              placeholder={target.requiresModel ? t.modelRequired : undefined}
              onChange={(event) =>{  setModel(event.target.value) }}
            />
          </div>
          <div style={FIELD}>
            <span>{t.formatLabel}</span>
            <select
              style={INPUT}
              value={format}
              onChange={(event) =>{  setFormat(apiFormatFrom(event.target.value, target.apiFormats)) }}
            >
              {target.apiFormats.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...FIELD, alignItems: 'start' }}>
            <span>{t.keyLabel}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600 }}>{selection.key.displayName}</span>
              <span style={{ marginLeft: 6, opacity: 0.7, font: '12px/1.4 ui-monospace, Consolas, monospace' }}>
                {selection.key.maskedKey}
              </span>
            </span>
          </div>
          <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>{t.filesHeading}</h3>
          {plan === null ? (
            <p style={{ opacity: 0.7 }}>{t.planUnavailable}</p>
          ) : (
            <>
              {plan.files.map(file => (
                <PlanFileCard
                  key={file.path}
                  file={file}
                  copy={(text, done) => {
                    void copy(text, done)
                  }}
                  copied={t.copiedAction}
                  t={t}
                  separator={separator}
                />
              ))}

              <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>{t.scriptHeading}</h3>
              <pre style={CODE}>{plan.script.text}</pre>
              {plan.launchCommand === undefined ? null : (
                <>
                  <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>{t.launchHeading}</h3>
                  <pre style={CODE}>{plan.launchCommand}</pre>
                </>
              )}
              {plan.notes.length === 0 ? null : (
                <>
                  <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>{t.notesHeading}</h3>
                  <ul style={{ margin: 0, paddingLeft: 20, opacity: 0.8 }}>
                    {plan.notes.map(note => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </>
              )}
              {plan.files.some(file => file.fragment !== undefined) ? (
                <p style={{ opacity: 0.6, marginTop: 10 }}>{t.mergeHint}</p>
              ) : null}
            </>
          )}
        </div>
        <div style={FOOTER}>
          {plan === null ? null : (
            <>
              <a style={PRIMARY} href={plan.deeplink ?? undefined}>
                {t.openInCcSwitchAction}
              </a>
              <button
                type="button"
                style={BUTTON}
                onClick={() => {
                  void copy(plan.deeplink ?? '', t.linkCopied)
                }}
              >
                {t.copyLinkAction}
              </button>
              <button
                type="button"
                style={BUTTON}
                onClick={() => {
                  void copy(plan.script.text, t.installCopied)
                }}
              >
                {t.copyInstallAction}
              </button>
            </>
          )}
          {feedback === null ? null : (
            <span style={{ opacity: 0.7, fontSize: 12 }}>{feedback}</span>
          )}
          <span style={{ flex: '1 1 auto' }} />
          <button type="button" style={BUTTON} onClick={onClose}>
            {t.closeAction}
          </button>
        </div>
      </div>
    </div>
  )
}
