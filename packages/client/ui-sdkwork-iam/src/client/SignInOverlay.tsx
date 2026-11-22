/**
 * The sign-in modal host: one `shell.overlay` entry rendering the sdkwork
 * modal login/register surface while the shared UI store says it is open.
 * Unconfigured (no IAM base URL) it renders the configuration notice inside
 * the same dialog shell, so the settings-menu gesture always opens a dialog.
 * Configured, it opens on the product's login entry — the same welcome surface
 * the desktop window shows (brand, welcome line, slogan, Sign in and
 * Add API Key) — and that entry's own Sign in gesture runs the configured flow:
 * the browser hand-off card by default, or the account method form (password,
 * phone code, email code, QR) when the login gesture is configured as the
 * in-app form. While that card owns the gesture, the entry keeps the in-app
 * form one quiet link away so a tenant without the OAuth relying-party
 * registration can still sign in without changing settings.
 * The frame's overlay layer is click-through; the dialog's own full-viewport
 * mask owns pointer events while mounted, and the entry renders nothing
 * otherwise.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import clsx from 'clsx'
import {
  Button, IconCloseOutlineRegular, LoginPanel, readOemBrandName, Toast, useClipboardCopy, type LoginAction,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  SdkworkSessionAuthLoginModal,
  SDKWORK_AUTH_I18N_CATALOG,
  type SdkworkAuthController,
  type SdkworkAuthRuntimeConfig,
} from '@sdkwork/auth-pc-react'
import { SdkworkI18nProvider } from '@sdkwork/i18n-pc-react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
// Type-only: pulls ui-layout's SlotMap merge ('shell.overlay' seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createIamUiStore } from './iam-ui-store.ts'
import type { IamBrowserLoginFailure, IamSignInNotice } from './iam-service.ts'
import type { UiIamKey } from './locales.ts'
import { sdkworkAuthAppearanceFor } from './auth-appearance.ts'
import { ConfigureNotice } from './ConfigureNotice.tsx'
import { SdkworkAuthThemeFrame } from './SdkworkAuthThemeFrame.tsx'
import css from './SignInOverlay.module.css'

/** Failure codes the card explains in the product's own words. */
const BROWSER_FAILURE_KEYS = {
  'browser-open-failed': 'browser.reason.browser-open-failed',
  'exchange-failed': 'browser.reason.exchange-failed',
  'flow-expired': 'browser.reason.flow-expired',
  'host-unavailable': 'browser.reason.host-unavailable',
  'invalid-callback': 'browser.reason.invalid-callback',
  'invalid-session': 'browser.reason.invalid-session',
  'provider-denied': 'browser.reason.provider-denied',
  'session-rejected': 'browser.reason.session-rejected',
  'state-mismatch': 'browser.reason.state-mismatch',
} as const satisfies Record<string, UiIamKey>

/**
 * Locale key for one failed browser-login step.
 *
 * A provider-denied `server_error` is the hosted authorization page refusing to
 * start the login: no consent screen was ever shown, so the generic "cancelled
 * or not approved" line would send the user looking for a decision they never
 * made. Every other provider-denied detail is the callback's OAuth error and
 * keeps that line.
 * @param failure - the desktop auth runtime's error code and detail.
 * @returns the copy key; an unknown code keeps the generic recovery line.
 */
function browserFailureKey(failure: IamBrowserLoginFailure): UiIamKey {
  if (failure.code === 'provider-denied' && failure.detail === 'server_error') {
    return 'browser.reason.provider-start-failed'
  }
  return BROWSER_FAILURE_KEYS[failure.code as keyof typeof BROWSER_FAILURE_KEYS] ?? 'browser.reason.unknown'
}

/** Longest summary line kept under the failure heading before it is clipped. */
const BROWSER_FAILURE_SUMMARY_LIMIT = 200

/**
 * One-line summary of a failure reason for the card itself.
 *
 * The details view keeps the reason whole: a hosted authorization failure can
 * arrive as several lines (the page's sentence plus the server's own report),
 * and only the first one belongs in the card's heading area.
 * @param text - the complete failure reason the runtime or server reported.
 * @returns the first line, clipped when a single line is longer than the card.
 */
function browserFailureSummary(text: string): string {
  const [firstLine = ''] = text.split(/\r?\n/u)
  const line = firstLine.trim()
  return line.length > BROWSER_FAILURE_SUMMARY_LIMIT ? `${line.slice(0, BROWSER_FAILURE_SUMMARY_LIMIT - 1)}…` : line
}

/**
 * Identity of one reported failure: a retry that fails the same way keeps the
 * details view as the user left it, while a different outcome starts collapsed.
 * @param failure - the failure the card currently reports.
 * @returns a stable key for the details element.
 */
function browserFailureIdentity(failure: IamBrowserLoginFailure): string {
  return [failure.code, failure.message ?? '', failure.detail ?? ''].join('\u0000')
}

/**
 * Plain-text report of one failure, for the details view's copy action.
 *
 * A support report needs the runtime's codes and messages and the server's own
 * answer in one paste, so the copied text repeats every field the details view
 * shows. Labels follow the card's locale; the wire values stay verbatim.
 * @param failure - the failure the card currently reports.
 * @param t - the locale seat.
 * @returns the complete report, one field per line.
 */
function browserFailureReport(failure: IamBrowserLoginFailure, t: SignInOverlayProps['t']): string {
  const lines = [
    `${t('browser.details.step')}: ${failure.code}`,
    ...(failure.message === undefined ? [] : [`${t('browser.details.message')}: ${failure.message}`]),
    ...(failure.detail === undefined
      ? []
      : [`${failure.code === 'provider-denied' ? t('browser.details.oauthError') : t('browser.details.detail')}: ${failure.detail}`]),
  ]
  const response = failure.response
  if (response === undefined) return lines.join('\n')
  lines.push(`${t('browser.details.response')}:`)
  if (response.status !== undefined) lines.push(`  ${t('browser.details.status')}: ${String(response.status)}`)
  if (response.code !== undefined) lines.push(`  ${t('browser.details.code')}: ${response.code}`)
  if (response.traceId !== undefined) lines.push(`  ${t('browser.details.trace')}: ${response.traceId}`)
  if (response.body !== undefined) lines.push(`  ${t('browser.details.body')}:`, response.body)
  return lines.join('\n')
}

/**
 * The failure's complete diagnostics, behind the card's details link.
 *
 * The card names the failing step in the product's words, and this view is what
 * a support report needs: the runtime's code and messages, plus the status,
 * wire code, trace id, and problem document when the app itself saw the IAM
 * server's answer. Everything is wire data and stays verbatim.
 * @param props - the reported failure and the locale seat.
 * @returns the details toggle and, while expanded, the diagnostics list.
 */
function BrowserFailureDetails({ failure, t, expanded, onToggle }: {
  failure: IamBrowserLoginFailure
  t: SignInOverlayProps['t']
  expanded: boolean
  onToggle: () => void
}) {
  const detailsId = useId()
  const { copied, onCopy } = useClipboardCopy(browserFailureReport(failure, t))
  const response = failure.response
  const runtimeRows = [
    { label: t('browser.details.step'), value: failure.code },
    ...(failure.message === undefined ? [] : [{ label: t('browser.details.message'), value: failure.message }]),
    // A refused hosted authorization carries the OAuth error value in `detail`
    // (`server_error`), not a description; naming it "detail" misreads it.
    ...(failure.detail === undefined
      ? []
      : [{
        label: failure.code === 'provider-denied' ? t('browser.details.oauthError') : t('browser.details.detail'),
        value: failure.detail,
      }]),
  ]
  // One compact line for the response's identity; the problem document below
  // it is the answer itself, so it starts as high in the panel as possible.
  const responseMeta = [
    ...(response?.status === undefined ? [] : [`${t('browser.details.status')} ${String(response.status)}`]),
    ...(response?.code === undefined ? [] : [`${t('browser.details.code')} ${response.code}`]),
    ...(response?.traceId === undefined ? [] : [`${t('browser.details.trace')} ${response.traceId}`]),
  ].join(' · ')
  return (
    <>
      <button
        type="button"
        className={css.detailsToggle}
        aria-expanded={expanded}
        // The panel exists only while expanded, so the relationship is stated
        // exactly when it can be followed.
        aria-controls={expanded ? detailsId : undefined}
        onClick={onToggle}
      >
        {expanded ? t('browser.details.hide') : t('browser.details.show')}
      </button>
      {expanded
        ? (
          <>
            <div className={css.detailsPanel} id={detailsId} data-testid="iam-browser-details">
              {/* The server's answer leads: it is the part that names the
                  failing call, and the card above already states the step. */}
              {response === undefined
                ? null
                : (
                  <section className={css.detailsSection}>
                    <div className={css.detailsSectionLabel}>{t('browser.details.response')}</div>
                    {responseMeta === '' ? null : <div className={css.detailsMeta}>{responseMeta}</div>}
                    {response.body === undefined ? null : <pre className={css.detailsBody}>{response.body}</pre>}
                  </section>
                )}
              <section className={css.detailsSection}>
                <dl className={css.detailsList}>
                  {runtimeRows.map(row => (
                    <div className={css.detailsRow} key={row.label}>
                      <dt className={css.detailsLabel}>{row.label}</dt>
                      <dd className={css.detailsValue}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
            {/* The copy action sits under the report it copies, so the whole
                block reads as one unit: expand, read, hand it to support. */}
            <div className={css.detailsActions}>
              <button type="button" className={css.detailsToggle} onClick={onCopy}>
                {copied ? t('browser.details.copied') : t('browser.details.copy')}
              </button>
              {/* Announced copy feedback for a control whose visible label also changes. */}
              <span className={css.copyStatus} role="status">{copied ? t('browser.details.copied') : ''}</span>
            </div>
          </>
        )
        : null}
    </>
  )
}

/**
 * The waiting card's manual fallback: copy the hosted authorize URL so a user
 * whose system browser reported success without showing a window can still
 * finish the login in any browser. The URL carries the PKCE challenge and the
 * one-time state, not the verifier.
 * @param props - the authorize URL and locale seat.
 * @returns the localized copy action with its own confirmation.
 */
function BrowserLinkCopy({ link, t }: { link: string; t: SignInOverlayProps['t'] }) {
  const { copied, onCopy } = useClipboardCopy(link)
  return (
    <div className={css.detailsActions}>
      <button type="button" className={css.detailsToggle} onClick={onCopy}>
        {copied ? t('browser.linkCopied') : t('browser.copyLink')}
      </button>
      {/* Announced copy feedback for a control whose visible label also changes. */}
      <span className={css.copyStatus} role="status">{copied ? t('browser.linkCopied') : ''}</span>
    </div>
  )
}

/** Injected business face: the auth controller, the gestures, locale, config. */
export interface SignInOverlayInjected {
  /** The auth controller driving the modal. */
  controller: SdkworkAuthController
  /** Close the modal (auth complete or dismiss). */
  onClose: () => void
  /** Run the configured Sign in gesture (browser hand-off or in-app form). */
  onStartLogin: () => void
  /** Raise the in-app account form directly, the alternate path behind a browser hand-off. */
  onStartInAppLogin: () => void
  /** Restart the browser hand-off after a failed attempt. */
  onRetryBrowser: () => void
  /** Open the shell's API-key page; absent outside the desktop shell. */
  startApiKey?: () => void
  /** The harness locale id mapped to the sdkwork tag. */
  locale: string
  /** The auth-surface runtime config: the account methods the modal offers. */
  runtimeConfig: SdkworkAuthRuntimeConfig
  /** Drop a sign-in notice once its toast finished. */
  dismissSignInNotice: (id: number) => void
  hooks: {
    /** Whether the IAM base URL is configured (false renders the notice). */
    configured: HostObservable<boolean>
    /** The resolved harness theme snapshot feeding the sdkwork appearance. */
    theme: HostObservable<ThemeSnapshot>
    /** Whether the last browser hand-off failed, so the card offers recovery. */
    browserFailed: HostObservable<boolean>
    /** Why that hand-off failed, so the card can name the failing step. */
    browserFailure: HostObservable<IamBrowserLoginFailure | undefined>
    /** Whether Sign in hands off to the system browser, so the in-app form needs its own link. */
    browserHandoff: HostObservable<boolean>
    /** The waiting attempt's hosted authorize URL; empty when none is waiting. */
    browserLink: HostObservable<string>
    /** The confirmation a finished background browser login raises, if any. */
    signInNotice: HostObservable<IamSignInNotice | undefined>
  }
}

/** Full component props: overlay owner share + store + injected face + locale seat. */
export type SignInOverlayProps =
  PropsRuntime<'shell.overlay'>
  & PropsStore<ReturnType<typeof createIamUiStore>>
  & InjectFace<SignInOverlayInjected>
  & PropsLocale<'uiIam'>

/**
 * Render the sign-in surface while the store says it is open.
 *
 * The dialog is portaled to the document body: the frame's overlay layer is a
 * z-index 20 stacking context, so a dialog mounted inside it always paints
 * below a page modal (the app's dialogs use 1000, SDKWork commerce modals 50).
 * A catalog or payment surface that asks for sign-in from behind its own modal
 * would otherwise cover the login card it just raised.
 *
 * The portal host repeats the two host-side behaviours those siblings relied on
 * while the card lived inside the frame's overlay layer: Radix dialogs set
 * `pointer-events: none` on the body and `aria-hidden` on every body sibling
 * while they are open, so the host restores interactivity and removes that
 * accessibility mark from the surface the user is meant to operate.
 * @param props - composed slot props (store share + injected face + locale seat).
 * @returns the modal element tree, or null while closed.
 */
export function SignInOverlay(props: SignInOverlayProps) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = host.current
    // The ref is assigned during commit, before effects run; only a torn-down
    // commit can leave it null, and there is nothing to observe then.
    /* v8 ignore next -- defensive: the portal host ref exists before this effect runs */
    if (node === null) return
    const clear = (): void => {
      node.removeAttribute('aria-hidden')
      node.removeAttribute('data-aria-hidden')
    }
    clear()
    const observer = new MutationObserver(clear)
    observer.observe(node, { attributes: true, attributeFilter: ['aria-hidden', 'data-aria-hidden'] })
    return () => { observer.disconnect() }
  }, [])
  return createPortal(
    <div ref={host} data-iam-sign-in-host="true" style={{ display: 'contents' }}>
      <SignInOverlayContent {...props} />
      {/* A browser login can finish while the dialog is closed: its result is
          announced here instead of reopening a surface the user dismissed. */}
      <SignInNoticeToast {...props} />
    </div>,
    document.body,
  )
}

/**
 * The confirmation a finished browser login raises, independent of the dialog.
 *
 * The deep link is the outcome of a login the user may have left running in the
 * system browser after closing the card; the toast reports the committed
 * session (or the card above raises the failure) so that outcome is never
 * silent.
 * @param props - the injected notice source, its dismiss gesture, and the locale seat.
 * @returns the toast while a notice is pending, nothing otherwise.
 */
function SignInNoticeToast({ useSignInNotice, dismissSignInNotice, t }: SignInOverlayProps) {
  const notice = useSignInNotice(value => value)
  if (notice === undefined) return null
  const text = notice.accountName === undefined
    ? t('browser.signedIn')
    : t('browser.signedInAs', { name: notice.accountName })
  return (
    <Toast
      key={notice.id}
      tone="success"
      text={text}
      onDone={() => { dismissSignInNotice(notice.id) }}
    />
  )
}

function SignInOverlayContent(props: SignInOverlayProps) {
  const {
    useStore, useConfigured, useTheme, useBrowserFailed, useBrowserFailure, useBrowserHandoff, useBrowserLink, onClose,
    onStartLogin, onStartInAppLogin, onRetryBrowser, startApiKey, locale, runtimeConfig, t,
  } = props
  const modalOpen = useStore(state => state.modalOpen)
  const step = useStore(state => state.step)
  const configured = useConfigured(config => config)
  const theme = useTheme(snapshot => snapshot)
  const browserFailed = useBrowserFailed(failed => failed)
  const browserFailure = useBrowserFailure(failure => failure)
  const browserHandoff = useBrowserHandoff(handoff => handoff)
  const browserLink = useBrowserLink(link => link)
  const colorScheme = theme.active.colorScheme
  // The step's localized line explains which part of the login broke; the
  // host's own reason is the detail a support report needs, so both are shown.
  // A refused start names its actionable reason in the hosted page's
  // description (`message`), while `detail` only carries the OAuth error class
  // (`server_error`). A failed exchange is the reverse: the runtime's own
  // message is a fixed "start again" summary and `detail` carries the
  // rejection the server or transport actually reported.
  const browserDetail = browserFailure === undefined
    ? undefined
    : browserFailure.code === 'provider-denied'
      ? browserFailure.message ?? browserFailure.detail
      : browserFailure.detail ?? browserFailure.message
  // The card keeps one line; the details view below it keeps the reason whole.
  const browserSummary = browserDetail === undefined ? undefined : browserFailureSummary(browserDetail)
  // The details view's only interaction state. A new failure starts collapsed;
  // while a report is open the card widens so the server's JSON document fits
  // without squeezing every other step.
  const failureIdentity = browserFailure === undefined ? '' : browserFailureIdentity(browserFailure)
  const [details, setDetails] = useState<{ identity: string; expanded: boolean }>({ identity: '', expanded: false })
  const detailsExpanded = failureIdentity !== '' && details.identity === failureIdentity && details.expanded
  const toggleDetails = (): void => {
    setDetails(current => ({
      identity: failureIdentity,
      expanded: !(current.identity === failureIdentity && current.expanded),
    }))
  }
  const titleId = useId()
  const headingId = useId()
  const descriptionId = useId()
  if (!modalOpen) return null
  if (!configured) {
    return (
      <SdkworkAuthThemeFrame colorScheme={colorScheme} surface="iam-sign-in">
        <div className={css.mask} role="presentation">
          <div
            className={css.panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <button
              type="button"
              aria-label={t('modal.close')}
              className={css.close}
              onClick={onClose}
            >
              <IconCloseOutlineRegular size={14} />
            </button>
            <ConfigureNotice t={t} titleId={titleId} />
          </div>
        </div>
      </SdkworkAuthThemeFrame>
    )
  }
  if (step === 'browser') {
    return (
      <div className={css.mask} role="presentation">
        <div
          className={clsx(css.panel, detailsExpanded && css.panelDetails)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
        >
          <button
            type="button"
            aria-label={t('modal.close')}
            className={css.close}
            onClick={onClose}
          >
            <IconCloseOutlineRegular size={14} />
          </button>
          <div className={css.browserTitle} id={headingId}>
            {browserFailed ? t('browser.failedTitle') : t('browser.title')}
          </div>
          <p className={css.browserDetail}>
            {browserFailed ? t('browser.failedDetail') : t('browser.detail')}
          </p>
          {/* A system browser that reported success but showed no window leaves
              the flow waiting with nothing to look at. The manual fallback
              copies the same authorize URL so the user can open it elsewhere;
              it disappears with the attempt, because a spent or expired state
              must not be offered for reopening. */}
          {!browserFailed && browserLink !== ''
            ? (
              <>
                <p className={css.browserHint}>{t('browser.copyLinkHint')}</p>
                <BrowserLinkCopy link={browserLink} t={t} />
              </>
            )
            : null}
          {browserFailed && browserFailure !== undefined
            ? <p className={css.browserReason}>{t(browserFailureKey(browserFailure))}</p>
            : null}
          {browserFailed && browserSummary !== undefined
            ? (
              <p className={css.browserDiagnostics} data-testid="iam-browser-failure-detail">
                {t('browser.failureDetail')}
                {browserSummary}
              </p>
            )
            : null}
          {/* The summary line above names the failing step; a support report
              needs the whole reason and the server's own answer, so the failed
              card keeps them one quiet link away. */}
          {browserFailed && browserFailure !== undefined
            ? (
              <BrowserFailureDetails
                key={failureIdentity}
                failure={browserFailure}
                t={t}
                expanded={detailsExpanded}
                onToggle={toggleDetails}
              />
            )
            : null}
          <div className={css.browserActions}>
            <Button variant="primary" onClick={onRetryBrowser}>{t('browser.retry')}</Button>
            {/* A tenant whose browser authorization keeps failing still needs a
                way in: the in-app account form is the same fallback the entry
                offers, so the failed card must not send the user back a step. */}
            {browserFailed
              ? <Button variant="ghost" onClick={onStartInAppLogin}>{t('entry.inAppLogin')}</Button>
              : null}
          </div>
        </div>
      </div>
    )
  }
  if (step === 'entry') {
    const brand = readOemBrandName()
    const actions: LoginAction[] = [
      { id: 'iam-sign-in', label: t('entry.signIn'), kind: 'primary', onClick: onStartLogin },
      ...startApiKey === undefined
        ? []
        : [{ id: 'iam-api-key', label: t('entry.addApiKey'), kind: 'secondary' as const, onClick: startApiKey }],
      // A browser hand-off leaves no in-app surface behind Sign in, so the
      // account form stays reachable as the quiet action under the column.
      // When Sign in already raises that form, the link would repeat it.
      ...browserHandoff
        ? [{ id: 'iam-in-app-login', label: t('entry.inAppLogin'), kind: 'text' as const, onClick: onStartInAppLogin }]
        : [],
    ]
    return (
      <div className={css.mask} role="presentation">
        <div className={css.card} role="dialog" aria-modal="true" aria-labelledby={headingId}>
          <LoginPanel
            variant="dialog"
            brand={brand}
            logoSrc="/favicon.png"
            markAlt=""
            welcome={{
              before: t('entry.welcomeBefore'),
              brand,
              after: t('entry.welcomeAfter'),
              description: t('entry.slogan'),
            }}
            headingId={headingId}
            descriptionId={descriptionId}
            close={{ label: t('modal.close'), onClick: onClose }}
            actions={actions}
          />
        </div>
      </div>
    )
  }
  return (
    <SdkworkAuthThemeFrame className={css.stage} colorScheme={colorScheme} surface="iam-sign-in">
      <MemoryRouter initialEntries={['/auth/login']}>
        <SdkworkI18nProvider catalogs={[SDKWORK_AUTH_I18N_CATALOG]} locale={locale}>
          <SdkworkSessionAuthLoginModal
            key={colorScheme}
            controller={props.controller}
            locale={locale}
            onAuthComplete={onClose}
            onDismiss={onClose}
            returnPath="/"
            runtimeConfig={runtimeConfig}
            appearance={sdkworkAuthAppearanceFor(colorScheme)}
          />
        </SdkworkI18nProvider>
      </MemoryRouter>
    </SdkworkAuthThemeFrame>
  )
}
