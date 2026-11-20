/**
 * Signed-token panel: the authenticated half of the access-token dialog.
 *
 * It signs the operator in (workspace config first, then the mounted IAM
 * session, then typed account/password), lists only the applications the
 * signed-in user created, exchanges one of them for its signed application
 * credential, and shows the credential for immediate use. The credential is
 * session-class (about one hour, revocable) and is deliberately never written
 * into a committed profile file.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientEnvironment } from './accessToken.ts'
import { CLIENT_ENVIRONMENTS } from './accessToken.ts'
import type {
  SaveAccessTokenCredentialsInput, SavedAccessTokenCredentials, SdkworkAccessTokenPrefill,
} from '../access-token-settings.ts'
import type {
  MyApplication, SdkworkGateway, SdkworkIamAccessPort, SdkworkSession, SignedAccessCredential,
} from './signedToken.ts'
import {
  assertExchangeInput, assertLoginInput, initialLoginValues, isOwnApplication, isPrivilegedAccount,
  ownApplications, resolveSdkworkGateway, validateSignedCredential,
} from './signedToken.ts'
import { messageOf } from './errors.ts'
import css from './AccessTokenDialog.module.css'

/** Localized translate seat of the dialog's namespace. */
type Translate = (key: string, params?: Record<string, string>) => string

/** Injected transport face of the signed flow (the shipped SDK adapter or a test stub). */
export interface SignedAccessFeatures {
  /** Resolve the gateway from the remembered login and the shared environment. */
  gateway: (config: SdkworkAccessTokenPrefill | undefined) => SdkworkGateway
  /** Current mounted IAM session, when one is signed in and carries both tokens. */
  currentSession: (gateway: SdkworkGateway) => Promise<SdkworkSession | undefined>
  /** Password-grant login. */
  login: SdkworkIamAccessPort['login']
  /** List the session's deploy applications. */
  listApplications: SdkworkIamAccessPort['listApplications']
  /** Exchange one application for its signed credential. */
  exchange: SdkworkIamAccessPort['exchange']
}

/** Props of the panel. */
export interface SignedTokenPanelProps {
  /** Injected transport face. */
  signed: SignedAccessFeatures
  /** The login the DSH-home settings section remembers for this project. */
  savedCredentials?: SdkworkAccessTokenPrefill | undefined
  /**
   * Persist an admin/operator login into the DSH-home settings section. Absent
   * when the Host settings face is unavailable; ordinary accounts never use it.
   */
  saveCredentials?: SaveCredentials | undefined
  /** Localized translate seat. */
  t: Translate
}

/** Persist one privileged login configuration. */
export type SaveCredentials = (
  input: SaveAccessTokenCredentialsInput,
) => Promise<SavedAccessTokenCredentials>

/**
 * Whether a remembered environment string is a lifecycle value.
 * @param value - candidate environment.
 * @returns true for one of the five lifecycle environments.
 */
function isEnvironment(value: string | undefined): value is ClientEnvironment {
  return value !== undefined && (CLIENT_ENVIRONMENTS as readonly string[]).includes(value)
}

/** Busy phase of the panel. */
type Phase = 'idle' | 'restoring' | 'loggingIn' | 'loadingApps' | 'generating'

/** State machine of one signed-flow session. */
interface PanelState {
  session: SdkworkSession | undefined
  applications: MyApplication[]
  selectedAnchor: string
  environment: ClientEnvironment
  credential: SignedAccessCredential | undefined
  claims: Record<string, unknown> | undefined
  phase: Phase
  error: string | undefined
  notice: string | undefined
}

/**
 * Render the signed-token flow for one scanned project.
 * @param props - project, transport face, and locale seat.
 * @returns the panel element tree.
 */
export function SignedTokenPanel({
  signed, savedCredentials, saveCredentials, t,
}: SignedTokenPanelProps) {
  const initial = useMemo(() => initialLoginValues(savedCredentials), [savedCredentials])
  const gateway = useMemo(
    () => resolveSdkworkGateway(savedCredentials, signed.gateway(savedCredentials)),
    [savedCredentials, signed],
  )
  const [username, setUsername] = useState(initial.username)
  const [password, setPassword] = useState(initial.password)
  const [state, setState] = useState<PanelState>(() => ({
    session: undefined,
    applications: [],
    selectedAnchor: '',
    environment: savedCredentials !== undefined && isEnvironment(savedCredentials.environment)
      ? savedCredentials.environment
      : 'development',
    credential: undefined,
    claims: undefined,
    phase: 'restoring',
    error: undefined,
    notice: undefined,
  }))
  const [revealed, setRevealed] = useState(false)
  const autoLogin = useRef(false)

  /** Load the caller's own applications into the panel state. */
  const loadApplications = async (session: SdkworkSession): Promise<void> => {
    setState(previous => ({ ...previous, phase: 'loadingApps', error: undefined }))
    const listed = await signed.listApplications(session)
    const mine = ownApplications(listed, session.userId, session.username)
    setState(previous => ({
      ...previous,
      phase: 'idle',
      applications: mine,
      selectedAnchor: mine.some(app => app.anchor === previous.selectedAnchor)
        ? previous.selectedAnchor
        : (mine[0]?.anchor ?? ''),
    }))
  }

  /** Run the password grant and continue with the issued session. */
  const loginWith = async (values: { username: string; password: string }): Promise<void> => {
    assertLoginInput(values, gateway)
    setState(previous => ({ ...previous, phase: 'loggingIn', error: undefined, notice: undefined }))
    const session = await signed.login({
      baseUrl: gateway.baseUrl,
      bootstrapAccessToken: gateway.bootstrapAccessToken,
      username: values.username.trim(),
      password: values.password,
    })
    setUsername(session.username ?? values.username.trim())
    // The password is cleared as soon as the session exists: it is not needed
    // again and must not linger in component state.
    setPassword('')
    setState(previous => ({ ...previous, session, credential: undefined, claims: undefined }))
    await rememberPrivilegedLogin(session, values)
    await loadApplications(session)
  }

  /**
   * Remember an admin/operator login in the DSH-home settings section.
   *
   * Only privileged account names are remembered; an ordinary user's password
   * is never written. A save failure is reported beside the session instead of
   * failing the login that already succeeded.
   */
  const rememberPrivilegedLogin = async (
    session: SdkworkSession,
    values: { username: string; password: string },
  ): Promise<void> => {
    const account = session.username ?? values.username.trim()
    if (!isPrivilegedAccount(account) || saveCredentials === undefined) return
    try {
      const saved = await saveCredentials({
        username: account,
        password: values.password,
        baseUrl: gateway.baseUrl,
        bootstrapAccessToken: gateway.bootstrapAccessToken,
        environment: state.environment,
      })
      setState(previous => ({
        ...previous,
        notice: t(saved.status === 'written' ? 'signed.credentials.saved' : 'signed.credentials.unchanged', {
          path: saved.path,
        }),
      }))
    } catch (error: unknown) {
      setState(previous => ({
        ...previous,
        notice: t('signed.credentials.saveFailed', { message: messageOf(error) }),
      }))
    }
  }

  // Restore the mounted IAM session on mount, or use the configured
  // credentials. A rejected restore falls back to the login form instead of
  // failing the whole dialog.
  useEffect(() => {
    let cancelled = false
    const isCancelled = (): boolean => cancelled
    void (async () => {
      try {
        const current = await signed.currentSession(gateway)
        if (isCancelled()) return
        if (current !== undefined) {
          setState(previous => ({ ...previous, session: current }))
          await loadApplications(current)
          return
        }
      } catch {
        // Fall through to the login form.
      }
      if (isCancelled()) return
      if (initial.username !== '' && initial.password !== '' && !autoLogin.current) {
        autoLogin.current = true
        try {
          await loginWith({ username: initial.username, password: initial.password })
          return
        } catch (error: unknown) {
          if (isCancelled()) return
          setState(previous => ({ ...previous, phase: 'idle', error: messageOf(error) }))
          return
        }
      }
      setState(previous => ({ ...previous, phase: 'idle' }))
    })()
    return () => { cancelled = true }
    // The gateway identity and the configured values decide the restore.
  }, [gateway.baseUrl, gateway.bootstrapAccessToken, initial.username, initial.password])

  const selectedApplication = state.applications.find(app => app.anchor === state.selectedAnchor)

  const onLogin = (): void => {
    setState(previous => ({ ...previous, error: undefined }))
    void loginWith({ username, password }).catch((error: unknown) => {
      setState(previous => ({ ...previous, phase: 'idle', error: messageOf(error) }))
    })
  }

  const onGenerate = (): void => {
    const session = state.session
    const application = selectedApplication
    if (session === undefined || application === undefined) return
    setState(previous => ({ ...previous, phase: 'generating', error: undefined, credential: undefined }))
    void (async () => {
      assertExchangeInput(application, session, state.environment)
      if (!isOwnApplication(application, session.userId, session.username)) {
        throw new Error('the selected application was not created by the signed-in user')
      }
      const credential = await signed.exchange(session, {
        appId: application.anchor,
        environment: state.environment,
      })
      const claims = validateSignedCredential(credential, {
        application,
        session,
        environment: state.environment,
      })
      setState(previous => ({ ...previous, phase: 'idle', credential, claims }))
    })().catch((error: unknown) => {
      setState(previous => ({ ...previous, phase: 'idle', error: messageOf(error) }))
    })
  }

  const onCopy = (text: string): void => {
    void writeClipboard(text).then(() => {
      setState(previous => ({ ...previous, notice: t('signed.copied'), error: undefined }))
    }).catch((error: unknown) => {
      setState(previous => ({ ...previous, error: messageOf(error) }))
    })
  }

  const busy = state.phase !== 'idle'
  const configDerived = initial.username !== ''
  const gatewayMissing = gateway.baseUrl === '' || gateway.bootstrapAccessToken === ''

  return (
    <section className={css.signedPanel}>
      <h3 className={css.sectionTitle}>{t('signed.title')}</h3>
      <p className={css.noteSecondary}>{t('signed.description')}</p>
      {gatewayMissing
        ? <p className={css.error}>{t('signed.gateway.missing')}</p>
        : <p className={css.noteSecondary}>{t('signed.gateway', { baseUrl: gateway.baseUrl })}</p>}

      {state.session === undefined
        ? (
          <div className={css.section}>
            <h4 className={css.sectionTitle}>{t('signed.login.title')}</h4>
            <p className={css.noteSecondary}>
              {configDerived ? t('signed.config.used') : t('signed.config.missing')}
            </p>
            <div className={css.loginGrid}>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('signed.username')}</span>
                <input
                  className={css.input}
                  type="text"
                  autoComplete="username"
                  value={username}
                  disabled={busy}
                  onChange={(event) => { setUsername(event.target.value) }}
                />
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('signed.password')}</span>
                <input
                  className={css.input}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  disabled={busy}
                  onChange={(event) => { setPassword(event.target.value) }}
                />
              </label>
            </div>
            <div className={css.actions}>
              <button
                type="button"
                className={css.submit}
                onClick={onLogin}
                disabled={busy || gatewayMissing}
              >
                {state.phase === 'loggingIn' || state.phase === 'restoring'
                  ? t('signed.loggingIn')
                  : t('signed.login')}
              </button>
            </div>
          </div>
        )
        : (
          <div className={css.section}>
            <p className={css.sessionLine}>
              <span className={css.sessionBadge}>{t('signed.session.badge')}</span>
              <span>{t('signed.session', {
                name: state.session.username === undefined || state.session.username === ''
                  ? t('signed.session.userFallback')
                  : state.session.username,
              })}</span>
              <span className={css.noteSecondary}>{t('signed.session.id', { id: state.session.userId })}</span>
            </p>
            <div className={css.loginGrid}>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('signed.apps')}</span>
                <select
                  className={css.select}
                  value={state.selectedAnchor}
                  disabled={busy || state.applications.length === 0}
                  onChange={(event) => {
                    setState(previous => ({ ...previous, selectedAnchor: event.target.value }))
                  }}
                >
                  {state.applications.map(application => (
                    <option key={application.anchor} value={application.anchor}>
                      {`${application.name} · ${application.ownershipScope} · ${application.anchor}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('signed.environment')}</span>
                <select
                  className={css.select}
                  value={state.environment}
                  disabled={busy}
                  onChange={(event) => {
                    setState(previous => ({ ...previous, environment: event.target.value as ClientEnvironment }))
                  }}
                >
                  {CLIENT_ENVIRONMENTS.map(environment => (
                    <option key={environment} value={environment}>{environment}</option>
                  ))}
                </select>
              </label>
            </div>
            {state.phase === 'loadingApps' && <p className={css.noteSecondary}>{t('signed.apps.loading')}</p>}
            {state.phase !== 'loadingApps' && state.applications.length === 0 && (
              <p className={css.noteSecondary}>{t('signed.apps.empty')}</p>
            )}
            <div className={css.actions}>
              <button
                type="button"
                className={css.submit}
                onClick={onGenerate}
                disabled={busy || selectedApplication === undefined}
              >
                {state.phase === 'generating' ? t('signed.generating') : t('signed.generate')}
              </button>
            </div>
          </div>
        )}

      {state.error !== undefined && <p className={css.error} role="alert">{t('signed.error', { message: state.error })}</p>}
      {state.notice !== undefined && <p className={css.noteSecondary} role="status">{state.notice}</p>}

      {state.credential !== undefined && state.claims !== undefined && (
        <div className={css.section}>
          <h4 className={css.sectionTitle}>{t('signed.result.title')}</h4>
          <p className={css.noteSecondary}>{t('signed.result.notice')}</p>
          <dl className={css.claims}>
            <dt>{t('signed.result.scope')}</dt><dd>{state.credential.ownershipScope}</dd>
            <dt>{t('signed.result.anchor')}</dt><dd>{state.credential.appId}</dd>
            <dt>{t('signed.result.environment')}</dt><dd>{state.credential.environment ?? state.environment}</dd>
            <dt>{t('signed.result.expires')}</dt><dd>{state.credential.expiresAt}</dd>
          </dl>
          <label className={css.field}>
            <span className={css.fieldLabel}>{t('signed.result.accessToken')}</span>
            <textarea
              className={css.tokenArea}
              readOnly
              rows={3}
              value={state.credential.accessToken}
              onFocus={(event) => { event.target.select() }}
            />
          </label>
          {!revealed
            ? (
              <button type="button" className={css.linkButton} onClick={() => { setRevealed(true) }}>
                {t('signed.showAuthToken')}
              </button>
            )
            : (
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('signed.result.authToken')}</span>
                <textarea
                  className={css.tokenArea}
                  readOnly
                  rows={3}
                  value={state.credential.authToken}
                  onFocus={(event) => { event.target.select() }}
                />
              </label>
            )}
          <div className={css.actions}>
            <button type="button" className={css.cancel} onClick={() => { onCopy(state.credential?.accessToken ?? '') }}>
              {t('signed.copy.access')}
            </button>
            <button
              type="button"
              className={css.cancel}
              onClick={() => { onCopy(JSON.stringify({
                accessToken: state.credential?.accessToken ?? '',
                authToken: state.credential?.authToken ?? '',
                expiresAt: state.credential?.expiresAt ?? '',
                appId: state.credential?.appId ?? '',
                ownershipScope: state.credential?.ownershipScope ?? '',
                environment: state.credential?.environment ?? '',
              }, null, 2)) }}
            >
              {t('signed.copy.pair')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
