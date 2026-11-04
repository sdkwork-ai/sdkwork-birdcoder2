/** Account authorization dialog; errors allow retry after cancelling any active attempt. */
import { useEffect, useState } from 'react'
import {
  LoginPanel, Modal, readOemBrandName, readOemShowApiKeyEntry, type LoginAction,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountSnapshot } from './AccountSection.tsx'
import type { SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { AccountKey } from './locales.ts'
import { authorizeUrlWithTheme } from './authorize-url.ts'
import css from './SignInDialog.module.css'

/** @param props - safe account state, localized copy, and user actions. @returns login dialog. */
export function SignInDialog({ account, colorScheme, start, cancel, close, useApiKey, t }: {
  account: AccountSnapshot
  /** Resolved scheme of the active application theme; the copied link carries it. */
  colorScheme: 'light' | 'dark'
  start: () => Promise<void>
  cancel: (id: SignInAttemptId) => Promise<void>
  close: () => void
  useApiKey: () => void
  t: (key: AccountKey) => string
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copyResult, setCopyResult] = useState<{ messageKey: 'copiedLink' | 'copyFailed' } | null>(null)
  const attempt = account.view?.attempt
  useEffect(() => { setCopyResult(null) }, [attempt?.id, attempt?.authorizeUrl])
  useEffect(() => {
    if (copyResult === null) return
    const timer = setTimeout(() => { setCopyResult(null) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copyResult])
  const authorizeUrl = attempt?.authorizeUrl
  const phase = attempt?.phase
  const active = busy || phase === 'initializing' || phase === 'waiting-browser' || phase === 'exchanging' || phase === 'committing'
  const expired = phase === 'expired'
  const localFailure = failed || account.loginFailed || account.failed
  const error = localFailure || phase === 'failed'
  const failureKey = !localFailure
    && phase === 'failed' && attempt?.errorCode === 'no-response' ? 'noResponse' : 'failed'
  const waiting = active && !error
  const committing = phase === 'committing'
  useEffect(() => { if (account.view?.status === 'credential-stored') close() }, [account.view?.status, close])
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailed(false)
    try { await action() } catch { setFailed(true) } finally { setBusy(false) }
  }
  const dismiss = () => {
    if (committing || busy) return
    if (active && attempt) void run(async () => { await cancel(attempt.id); close() })
    else close()
  }
  const retry = async () => {
    if (active && attempt) await cancel(attempt.id)
    await start()
  }
  const copyLink = async (authorizeUrl: string) => {
    try {
      await navigator.clipboard.writeText(authorizeUrlWithTheme(authorizeUrl, colorScheme))
      setCopyResult({ messageKey: 'copiedLink' })
    } catch { setCopyResult({ messageKey: 'copyFailed' }) }
  }
  const brand = readOemBrandName()
  // The API-key fallback stays hidden unless the deployment opts in.
  const showApiKeyEntry = readOemShowApiKeyEntry()
  const welcomeTitle = `${t('loginWelcomeBefore')}${brand}${t('loginWelcomeAfter')}`.trim()
  // A running or finished attempt replaces the welcome block with its status copy.
  const methodStep = active || expired || error
  const title = error ? t('failureTitle') : active ? t('browserTitle') : expired ? t('timeoutTitle') : welcomeTitle
  const statusCopy = error ? t(failureKey) : expired ? t('timeoutDescription') : null
  const entry: LoginAction[] = [
    { id: 'account-sign-in', label: t('signIn'), kind: 'primary', disabled: busy || committing || waiting || account.view === undefined,
      onClick: () => { void run(retry) } },
    ...showApiKeyEntry
      ? [{
        id: 'account-add-api-key', label: t('addApiKey'), kind: 'secondary' as const,
        disabled: committing || busy, onClick: useApiKey,
      }]
      : [],
  ]
  const status: LoginAction[] = expired || error
    ? [
      { id: 'account-retry', label: t('retry'), kind: 'primary', disabled: busy || committing || account.view === undefined,
        onClick: () => { void run(retry) } },
      ...active || showApiKeyEntry
        ? [{
          id: 'account-secondary', label: t(active ? 'cancel' : 'addApiKey'), kind: 'secondary' as const,
          disabled: committing || busy, onClick: active ? dismiss : useApiKey,
        }]
        : [],
    ]
    : [
      { id: 'account-sign-in', label: t('signIn'), kind: 'primary', busy: true, busyLabel: t('waiting') },
      { id: 'account-cancel', label: t('cancel'), kind: 'secondary', disabled: committing || busy, onClick: dismiss },
    ]
  return <Modal open headless title={title} onClose={dismiss} className={css.dialog}>
    <LoginPanel
      variant="dialog"
      brand={brand}
      logoSrc="/favicon.png"
      markAlt={methodStep ? brand : ''}
      welcome={methodStep
        ? undefined
        : {
          before: t('loginWelcomeBefore'), brand, after: t('loginWelcomeAfter'), description: t('loginSlogan'),
        }}
      headingId="account-login-heading"
      descriptionId="account-login-slogan"
      close={{ label: t('close'), onClick: dismiss }}
      actions={methodStep ? status : entry}
    >
      {methodStep
        ? <div className={css.status}>
          <h1 className={css.statusTitle}>{title}</h1>
          {waiting
            ? <p className={css.statusDescription}>
              {t('browserPrompt')}<button type="button" className={css.link} disabled={!authorizeUrl}
                onClick={authorizeUrl ? () => { void copyLink(authorizeUrl) } : undefined}>
                {t(copyResult?.messageKey ?? 'copyLink')}
              </button>{t('browserDescription')}
            </p>
            : statusCopy === null ? null : <p className={css.statusDescription}>{statusCopy}</p>}
        </div>
        : null}
    </LoginPanel>
  </Modal>
}
