/**
 * Mini-program account ledger inside the dialog: the tenant's
 * `mini_program` resource accounts, the create form (AppID/AppSecret/name/
 * enabled), the edit form (name plus rotate-only credentials), status toggling,
 * deletion behind an inline confirmation, and the backend login check.
 *
 * The component owns viewing and form state; every operation goes through
 * `miniProgramApi.ts`, which mirrors the sdkwork-iam PC admin account flow.
 */
import { useCallback, useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'
import clsx from 'clsx'
import { Button, Drawer, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { SdkworkBackendClient } from '@sdkwork/iam-backend-sdk'
import {
  createMiniProgramAccount, deleteMiniProgramAccount, listMiniProgramAccounts, queueMiniProgramLoginCheck,
  setMiniProgramEnabled, updateMiniProgramAccount, type MiniProgramAccount, type MiniProgramBackend,
} from './miniProgramApi.ts'
import { errorText, formatTimestamp, validateMiniProgramDraft, validateMiniProgramEdit } from './miniProgramView.ts'
import type { MiniProgramKey } from './locales.ts'
import css from './MiniProgramsModal.module.css'

/** How a failed operation reads: the wire message when present, a typed fallback otherwise. */
interface Failure {
  message: string
  fallback: MiniProgramKey
}

/** Props handed down by the dialog. */
export interface MiniProgramsWorkspaceProps {
  client: SdkworkBackendClient
  t: Translate<MiniProgramKey>
}

/** Form state of one account. */
interface AccountDraft {
  appId: string
  appSecret: string
  displayName: string
  enabled: boolean
}

const EMPTY_DRAFT: AccountDraft = { appId: '', appSecret: '', displayName: '', enabled: true }

/**
 * Render the mini-program account ledger and its forms.
 * @param props - the generated backend client and the locale seat.
 * @returns the workspace element tree.
 */
export function MiniProgramsWorkspace({ client, t }: MiniProgramsWorkspaceProps): ReactNode {
  const backend = client as unknown as MiniProgramBackend
  const [accounts, setAccounts] = useState<readonly MiniProgramAccount[] | undefined>(undefined)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | undefined>(undefined)
  const [createOpen, setCreateOpen] = useState(false)
  const [draft, setDraft] = useState<AccountDraft>(EMPTY_DRAFT)
  const [createError, setCreateError] = useState<MiniProgramKey | undefined>(undefined)
  const [createFailure, setCreateFailure] = useState<Failure | undefined>(undefined)
  const [editing, setEditing] = useState<MiniProgramAccount | undefined>(undefined)
  const [editDraft, setEditDraft] = useState<AccountDraft>(EMPTY_DRAFT)
  const [editError, setEditError] = useState<MiniProgramKey | undefined>(undefined)
  const [editFailure, setEditFailure] = useState<Failure | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    try {
      setAccounts(await listMiniProgramAccounts(backend))
    } catch (err) {
      setError({ message: errorText(err), fallback: 'error.load' })
    }
  }, [backend])

  useEffect(() => { void load() }, [load])

  const failureText = (failure: Failure): string => (failure.message === '' ? t(failure.fallback) : failure.message)

  const refresh = (): void => {
    setError(undefined)
    setNotice(undefined)
    setAccounts(undefined)
    void load()
  }

  const run = useCallback(async (task: () => Promise<void>): Promise<boolean> => {
    setBusy(true)
    setError(undefined)
    try {
      await task()
      return true
    } catch (err) {
      setError({ message: errorText(err), fallback: 'action.failed' })
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const submitCreate = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const validation = validateMiniProgramDraft(draft)
    if (!validation.ok) {
      setCreateError(`problem.${validation.problem}`)
      return
    }
    setBusy(true)
    setCreateFailure(undefined)
    try {
      await createMiniProgramAccount(backend, draft)
      setDraft(EMPTY_DRAFT)
      setCreateError(undefined)
      setCreateOpen(false)
      setAccounts(undefined)
      await load()
    } catch (err) {
      setCreateFailure({ message: errorText(err), fallback: 'action.failed' })
    } finally {
      setBusy(false)
    }
  }

  const openEdit = (account: MiniProgramAccount): void => {
    setEditing(account)
    setEditDraft({ appId: account.appId, appSecret: '', displayName: account.displayName, enabled: account.enabled })
    setEditError(undefined)
    setEditFailure(undefined)
    setCreateOpen(false)
  }

  const submitEdit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const target = editing
    /* v8 ignore next -- the form only mounts while an account is being edited */
    if (target === undefined) return
    const validation = validateMiniProgramEdit(editDraft)
    if (!validation.ok) {
      setEditError(`problem.${validation.problem}`)
      return
    }
    setBusy(true)
    setEditFailure(undefined)
    try {
      await updateMiniProgramAccount(backend, target, {
        displayName: editDraft.displayName,
        appId: editDraft.appId,
        appSecret: editDraft.appSecret,
      })
      setEditing(undefined)
      setEditError(undefined)
      setAccounts(undefined)
      await load()
    } catch (err) {
      setEditFailure({ message: errorText(err), fallback: 'action.failed' })
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (account: MiniProgramAccount): Promise<void> => {
    await run(async () => {
      await setMiniProgramEnabled(backend, account, !account.enabled)
      setAccounts(undefined)
      await load()
    })
  }

  const remove = async (account: MiniProgramAccount): Promise<void> => {
    const removed = await run(async () => {
      await deleteMiniProgramAccount(backend, account.id)
      setAccounts(undefined)
      await load()
    })
    if (removed) setConfirmId(undefined)
  }

  const checkLogin = async (account: MiniProgramAccount): Promise<void> => {
    const queued = await run(async () => {
      await queueMiniProgramLoginCheck(backend, account.id)
    })
    if (queued) setNotice(t('account.loginCheckQueued', { name: account.displayName }))
  }

  return (
    <div className={css.workspace}>
      <div className={css.toolbar}>
        <div className={css.toolbarActions}>
          <Button size="sm" onClick={refresh}>{t('common.refresh')}</Button>
        </div>
        <div className={css.toolbarActions}>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => {
              setCreateOpen(true); setEditing(undefined); setCreateError(undefined); setCreateFailure(undefined)
            }}
          >
            {t('account.add')}
          </Button>
        </div>
      </div>
      <div className={css.hint}>{t('section.permissionHint')}</div>

      {error !== undefined && (
        <div className={clsx(css.banner, css.bannerError)} role="alert">
          <span>{failureText(error)}</span>
          <Button size="sm" onClick={refresh}>{t('common.retry')}</Button>
        </div>
      )}
      {notice !== undefined && (
        <div className={css.banner} role="status">
          <span>{notice}</span>
          <Button size="sm" onClick={() => { setNotice(undefined) }}>{t('common.cancel')}</Button>
        </div>
      )}

      <Drawer
        open={createOpen}
        onClose={() => {
          setCreateOpen(false); setDraft(EMPTY_DRAFT); setCreateError(undefined); setCreateFailure(undefined)
        }}
        title={t('create.title')}
        closeLabel={t('close')}
      >
        <form className={css.form} onSubmit={(event) => { void submitCreate(event) }}>
          <div className={css.formGrid}>
            <label className={css.field}>
              <span>{t('create.appId')}</span>
              <Input
                autoComplete="off"
                value={draft.appId}
                placeholder={t('create.appIdPlaceholder')}
                onChange={(event) => { setDraft({ ...draft, appId: event.target.value }) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('create.appSecret')}</span>
              <Input
                autoComplete="new-password"
                type="password"
                value={draft.appSecret}
                placeholder={t('create.appSecretPlaceholder')}
                onChange={(event) => { setDraft({ ...draft, appSecret: event.target.value }) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('create.displayName')}</span>
              <Input
                value={draft.displayName}
                placeholder={t('create.displayNamePlaceholder')}
                onChange={(event) => { setDraft({ ...draft, displayName: event.target.value }) }}
              />
            </label>
          </div>
          <label className={css.checkRow}>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => { setDraft({ ...draft, enabled: event.target.checked }) }}
            />
            <span>{t('create.enabled')}</span>
          </label>
          {createError !== undefined && <div className={css.fieldError} role="alert">{t(createError)}</div>}
          {createFailure !== undefined && (
            <div className={css.fieldError} role="alert">{failureText(createFailure)}</div>
          )}
          <div className={css.formActions}>
            <Button size="sm" onClick={() => {
              setCreateOpen(false); setDraft(EMPTY_DRAFT); setCreateError(undefined); setCreateFailure(undefined)
            }}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy}>{t('create.submit')}</Button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={editing !== undefined}
        onClose={() => { setEditing(undefined); setEditError(undefined); setEditFailure(undefined) }}
        title={t('edit.title')}
        closeLabel={t('close')}
      >
        <form className={css.form} onSubmit={(event) => { void submitEdit(event) }}>
          <div className={css.formGrid}>
            <label className={css.field}>
              <span>{t('edit.displayName')}</span>
              <Input
                value={editDraft.displayName}
                onChange={(event) => { setEditDraft({ ...editDraft, displayName: event.target.value }) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('edit.appId')}</span>
              <Input
                autoComplete="off"
                value={editDraft.appId}
                onChange={(event) => { setEditDraft({ ...editDraft, appId: event.target.value }) }}
              />
            </label>
            <label className={css.field}>
              <span>{t('edit.appSecret')}</span>
              <Input
                autoComplete="new-password"
                type="password"
                value={editDraft.appSecret}
                onChange={(event) => { setEditDraft({ ...editDraft, appSecret: event.target.value }) }}
              />
              <span className={css.fieldHint}>{t('edit.appSecretHint')}</span>
            </label>
          </div>
          {editError !== undefined && <div className={css.fieldError} role="alert">{t(editError)}</div>}
          {editFailure !== undefined && (
            <div className={css.fieldError} role="alert">{failureText(editFailure)}</div>
          )}
          <div className={css.formActions}>
            <Button size="sm" onClick={() => { setEditing(undefined); setEditError(undefined); setEditFailure(undefined) }}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={busy}>{t('edit.submit')}</Button>
          </div>
        </form>
      </Drawer>

      {accounts === undefined
        ? <div className={css.empty}>{t('common.loading')}</div>
        : accounts.length === 0
          ? <div className={css.empty}>{t('account.empty')}</div>
          : (
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th>{t('account.name')}</th>
                    <th>{t('account.appId')}</th>
                    <th>{t('account.status')}</th>
                    <th>{t('account.integration')}</th>
                    <th>{t('account.updatedAt')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const updated = formatTimestamp(account.updatedAt)
                    return (
                      <tr key={account.id}>
                        <td>
                          <div className={css.cellMain}>
                            <span>{account.displayName}</span>
                          </div>
                        </td>
                        <td><span className={css.mono}>{account.appId}</span></td>
                        <td>
                          <span className={clsx(css.badge, account.enabled ? css.badgeOk : css.badgeMuted)}>
                            {account.enabled ? t('account.enabled') : t('account.disabled')}
                          </span>
                        </td>
                        <td>
                          <span className={clsx(css.badge, account.integrationId !== undefined ? css.badgeOk : css.badgeMuted)}>
                            {account.integrationId !== undefined ? t('account.integrationBound') : t('account.integrationNone')}
                          </span>
                        </td>
                        <td>{updated === '' ? t('common.none') : updated}</td>
                        <td>
                          <div className={css.rowActions}>
                            <Button size="sm" disabled={busy} onClick={() => { openEdit(account) }}>
                              {t('common.edit')}
                            </Button>
                            <Button size="sm" disabled={busy} onClick={() => { void toggle(account) }}>
                              {account.enabled ? t('account.disable') : t('account.enable')}
                            </Button>
                            <Button size="sm" disabled={busy} onClick={() => { void checkLogin(account) }}>
                              {t('account.loginCheck')}
                            </Button>
                            {confirmId === account.id
                              ? (
                                <>
                                  <Button size="sm" onClick={() => { setConfirmId(undefined) }}>{t('common.cancel')}</Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    title={t('account.deleteHint')}
                                    disabled={busy}
                                    onClick={() => { void remove(account) }}
                                  >
                                    {t('common.confirmDelete')}
                                  </Button>
                                </>
                              )
                              : (
                                <Button size="sm" onClick={() => { setConfirmId(account.id) }}>{t('common.delete')}</Button>
                              )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
    </div>
  )
}
