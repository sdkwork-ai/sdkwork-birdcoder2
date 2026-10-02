/**
 * Deploy-app picker: the resolution step for the upload-code and
 * publish-as-template flows when the project manifest carries no linked
 * deploy_app (or the linked one no longer resolves). Lists the caller's
 * reachable apps through the publishing service and hands the picked
 * AppResponse back to the flow.
 */
import { useEffect, useRef, useState } from 'react'
import { createDeployAppPublishingService } from '@sdkwork/deployments-pc-console-publishing'
import type { SdkworkDeployAppClient, AppResponse } from '@sdkwork/deployments-app-sdk'
import type { SdkworkDriveAppClient } from '@sdkwork/drive-app-sdk'
import type { DeploymentsLocale } from '@sdkwork/deployments-pc-commons'
import type { DeployKey } from './locales.ts'
import css from './DeployDialogs.module.css'

/** Props for the deploy-app picker dialog. */
export interface DeployAppPickerDialogProps {
  readonly deployClient: SdkworkDeployAppClient
  readonly driveClient: SdkworkDriveAppClient
  /** Plugin locale seat (`deploy` namespace). */
  readonly t: (key: DeployKey, params?: Record<string, string>) => string
  readonly locale: DeploymentsLocale
  readonly theme: 'light' | 'dark'
  readonly onClose: () => void
  readonly onPicked: (app: AppResponse) => void
}

/** Modal picker over the caller's reachable deploy apps. */
export function DeployAppPickerDialog({
  deployClient,
  driveClient,
  t,
  onClose,
  onPicked,
}: DeployAppPickerDialogProps) {
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<AppResponse[] | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  // Latest-wins guard: keystrokes can outrun earlier list requests.
  const searchSeq = useRef(0)

  const search = async (nextKeyword: string): Promise<void> => {
    const seq = ++searchSeq.current
    setKeyword(nextKeyword)
    setLoading(true)
    setError(undefined)
    try {
      const service = createDeployAppPublishingService({ deployClient, driveClient })
      const page = await service.listApps({
        page: 1,
        pageSize: 50,
        ...(nextKeyword.trim() === '' ? {} : { keyword: nextKeyword.trim() }),
      })
      if (seq !== searchSeq.current) return
      setItems(page.items)
      setLoading(false)
    } catch (cause) {
      if (seq !== searchSeq.current) return
      setItems([])
      setLoading(false)
      setError(t('picker.loadFailed', { message: String(cause instanceof Error ? cause.message : cause) }))
    }
  }

  // The list loads on mount so the picker opens with the caller's apps
  // instead of an empty prompt.
  useEffect(() => {
    void search('')
    // The clients are fixed for the dialog's lifetime (re-created per mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('picker.title')}>
      <div className={css.modal}>
        <div className={css.modalHeader}>
          <h3 className={css.modalTitle}>{t('picker.title')}</h3>
          <button type="button" className={css.closeButton} onClick={onClose} aria-label={t('common.cancel')}>
            ✕
          </button>
        </div>
        <input
          type="search"
          className={css.input}
          placeholder={t('picker.searchPlaceholder')}
          value={keyword}
          onChange={(event) => { void search(event.target.value) }}
          autoFocus
        />
        <div className={css.appList}>
          {loading && items === undefined && <p className={css.hint}>{t('picker.loading')}</p>}
          {!loading && items !== undefined && items.length === 0 && error === undefined && (
            <p className={css.hint}>{t('picker.empty')}</p>
          )}
          {items?.map(app => (
            <button
              key={app.id}
              type="button"
              className={css.appRow}
              onClick={() => onPicked(app)}
            >
              <span className={css.appName}>{app.name}</span>
              <span className={css.appSlug}>{app.slug}</span>
              <span className={css.appStatus}>{app.appStatus}</span>
            </button>
          ))}
        </div>
        {error !== undefined && <p className={css.errorText} role="alert">{error}</p>}
        <div className={css.modalActions}>
          <button type="button" className={css.secondaryButton} onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
