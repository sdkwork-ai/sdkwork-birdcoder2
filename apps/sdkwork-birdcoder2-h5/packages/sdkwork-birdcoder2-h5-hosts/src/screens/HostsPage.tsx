/**
 * The host fleet list.
 *
 * Shows every machine this account has enrolled, and is the only place a host
 * is renamed or revoked. Editing is inline rather than `window.prompt`, and
 * confirmation is inline rather than `window.confirm`: a capability package
 * must not reach for a platform global, and a phone dialog cannot be styled or
 * driven by the host shell.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { Host, HostPlatform, HostStatus } from '@sdkwork/birdcoder2-h5-core'

import { resolveHostsMessages, type HostsMessages } from '../messages/hostsMessages.ts'
import { useHosts, toHostsFailure, type HostsFailure } from '../state/hostsState.tsx'

function platformLabel(platform: HostPlatform, messages: HostsMessages): string {
  switch (platform) {
    case 'windows':
      return messages.platformWindows
    case 'linux':
      return messages.platformLinux
    case 'macos':
      return messages.platformMacos
    case 'docker':
      return messages.platformDocker
    case 'cloud-sandbox':
      return messages.platformCloudSandbox
  }
}

function statusLabel(status: HostStatus, messages: HostsMessages): string {
  switch (status) {
    case 'pending':
      return messages.statusPending
    case 'online':
      return messages.statusOnline
    case 'offline':
      return messages.statusOffline
    case 'disabled':
      return messages.statusDisabled
  }
}

function statusTone(status: HostStatus): string {
  switch (status) {
    case 'online':
      return 'text-success'
    case 'pending':
      return 'text-warning'
    case 'offline':
      return 'text-muted-foreground'
    case 'disabled':
      return 'text-danger'
  }
}

/** Renders an epoch-second string from the wire as local time. */
function formatLastSeen(lastSeenAt: string | null | undefined, messages: HostsMessages): string {
  if (lastSeenAt === null || lastSeenAt === undefined || lastSeenAt.length === 0) {
    return messages.neverSeen
  }
  const seconds = Number(lastSeenAt)
  if (!Number.isFinite(seconds)) {
    return lastSeenAt
  }
  return new Date(seconds * 1000).toLocaleString()
}

/**
 * The sentence a failed host call shows.
 *
 * The platform message is not shown as the alert itself: the transport's own
 * wording is English and developer-shaped, so a `zh-Hans` shell was rendering
 * an untranslated error. The catalog's localized sentence leads, and the
 * platform message stays on screen as the trace-bearing detail a support report
 * needs.
 */
function failureText(failure: HostsFailure, messages: HostsMessages): string {
  return failure.code === 'authentication' ? messages.authenticationRequired : messages.loadFailed
}

/** The platform detail under a localized failure sentence, when it adds anything. */
function failureDetail(failure: HostsFailure): string | null {
  return failure.code === 'authentication' ? null : failure.message
}

export function HostsPage() {
  const messages = useMemo(() => resolveHostsMessages(), [])
  const navigate = useNavigate()
  const { hosts, isLoading, failure, refresh, renameHost, revokeHost } = useHosts()
  const [editingHostId, setEditingHostId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [confirmingHostId, setConfirmingHostId] = useState<string | null>(null)
  const [actionFailure, setActionFailure] = useState<HostsFailure | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  const beginRename = (host: Host) => {
    setActionFailure(null)
    setConfirmingHostId(null)
    setEditingHostId(host.hostId)
    setDraftName(host.displayName)
  }

  const commitRename = async (hostId: string) => {
    const displayName = draftName.trim()
    if (displayName.length === 0) {
      setEditingHostId(null)
      return
    }
    setIsMutating(true)
    setActionFailure(null)
    try {
      await renameHost(hostId, displayName)
      setEditingHostId(null)
    } catch (error: unknown) {
      setActionFailure(toHostsFailure(error))
    } finally {
      setIsMutating(false)
    }
  }

  const commitRevoke = async (hostId: string) => {
    setIsMutating(true)
    setActionFailure(null)
    try {
      await revokeHost(hostId)
      setConfirmingHostId(null)
    } catch (error: unknown) {
      setActionFailure(toHostsFailure(error))
    } finally {
      setIsMutating(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 p-4" data-testid="hosts-page">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{messages.listTitle}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{messages.listDescription}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs"
          onClick={() => void refresh()}
        >
          {messages.refresh}
        </button>
      </header>

      {actionFailure !== null ? (
        <div className="rounded-md border border-danger p-3 text-xs text-danger" role="alert">
          <p>{failureText(actionFailure, messages)}</p>
          {failureDetail(actionFailure) === null ? null : (
            <p className="mt-1 text-[11px] opacity-80">{failureDetail(actionFailure)}</p>
          )}
        </div>
      ) : null}

      {failure !== null ? (
        <div className="rounded-md border border-danger p-3 text-xs text-danger" role="alert">
          <p>{failureText(failure, messages)}</p>
          {failureDetail(failure) === null ? null : (
            <p className="mt-1 text-[11px] opacity-80">{failureDetail(failure)}</p>
          )}
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">{messages.loading}</p> : null}

      {!isLoading && hosts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6 text-center">
          <p className="text-sm font-medium">{messages.emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{messages.emptyDescription}</p>
        </div>
      ) : null}

      <ul className="flex flex-col gap-3">
        {hosts.map(host => (
          <li key={host.hostId} className="rounded-lg border border-border bg-surface p-4">
            {editingHostId === host.hostId ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground" htmlFor={`host-name-${host.hostId}`}>
                  {messages.displayName}
                </label>
                <input
                  id={`host-name-${host.hostId}`}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    disabled={isMutating}
                    onClick={() => void commitRename(host.hostId)}
                  >
                    {messages.confirm}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-1.5 text-xs"
                    onClick={() => setEditingHostId(null)}
                  >
                    {messages.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{host.displayName}</span>
                  <span className={`shrink-0 text-xs ${statusTone(host.status)}`}>
                    {statusLabel(host.status, messages)}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <dt>{messages.platform}</dt>
                  <dd>{platformLabel(host.platform, messages)}</dd>
                  <dt>{messages.lastSeen}</dt>
                  <dd>{formatLastSeen(host.lastSeenAt, messages)}</dd>
                  {host.runtimeVersion === null || host.runtimeVersion === undefined ? null : (
                    <>
                      <dt>{messages.runtimeVersion}</dt>
                      <dd>{host.runtimeVersion}</dd>
                    </>
                  )}
                </dl>

                {host.labels.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {host.labels.map(label => (
                      <li key={label} className="rounded-full border border-border px-2 py-0.5 text-[11px]">
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {confirmingHostId === host.hostId ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-md border border-danger p-3">
                    <p className="text-xs text-danger">{messages.revokeConfirm}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-danger px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        disabled={isMutating}
                        onClick={() => void commitRevoke(host.hostId)}
                      >
                        {messages.confirm}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-border px-3 py-1.5 text-xs"
                        onClick={() => setConfirmingHostId(null)}
                      >
                        {messages.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs"
                      onClick={() => beginRename(host)}
                    >
                      {messages.rename}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-danger"
                      onClick={() => {
                        setActionFailure(null)
                        setEditingHostId(null)
                        setConfirmingHostId(host.hostId)
                      }}
                    >
                      {messages.revoke}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="sticky bottom-4 rounded-md bg-primary px-4 py-3 text-sm text-white"
        onClick={() => void navigate('/hosts/enroll')}
      >
        {messages.enroll}
      </button>
    </section>
  )
}
