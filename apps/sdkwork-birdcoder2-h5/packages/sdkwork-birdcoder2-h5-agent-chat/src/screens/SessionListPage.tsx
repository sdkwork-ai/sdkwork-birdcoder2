/**
 * The session list.
 *
 * Sessions belong to a host, so this screen carries its own host selector
 * rather than assuming the one the chat page last used: the two tabs share the
 * provider, but a user may legitimately look at a different machine's history.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { AgentSession } from '@sdkwork/birdcoder2-h5-core'

import { resolveAgentChatMessages, resolveFailureBanner } from '../messages/agentChatMessages.ts'
import { toConversationFailure, useConversation, type ConversationFailure } from '../state/conversationState.tsx'

/** Renders an epoch-second string from the wire as local time. */
function formatActivity(lastActivityAt: string): string {
  const seconds = Number(lastActivityAt)
  return Number.isFinite(seconds) ? new Date(seconds * 1000).toLocaleString() : lastActivityAt
}

export function SessionListPage() {
  const messages = useMemo(() => resolveAgentChatMessages(), [])
  const navigate = useNavigate()
  const {
    hosts,
    selectedHostId,
    selectHost,
    sessions,
    isLoadingSessions,
    failure,
    createSession,
    renameSession,
    deleteSession,
    openSession,
  } = useConversation()

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [confirmingSessionId, setConfirmingSessionId] = useState<string | null>(null)
  const [actionFailure, setActionFailure] = useState<ConversationFailure | null>(null)
  const [isMutating, setIsMutating] = useState(false)

  const runAction = async (action: () => Promise<void>) => {
    setIsMutating(true)
    setActionFailure(null)
    try {
      await action()
    } catch (error: unknown) {
      setActionFailure(toConversationFailure(error))
    } finally {
      setIsMutating(false)
    }
  }

  const open = (session: AgentSession) => {
    openSession(session.sessionId)
    void navigate('/')
  }

  const banner = actionFailure ?? failure
  // Rename and delete are the only sources here, and both are triggered by the
  // user, so their failures read as an action rather than as a failed read.
  const bannerText = banner === null ? null : resolveFailureBanner(messages, banner, actionFailure !== null)

  return (
    <section className="flex flex-col gap-3 p-4" data-testid="session-list-page">
      <header>
        <h2 className="text-base font-semibold">{messages.sessionListTitle}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{messages.sessionListDescription}</p>
      </header>

      {bannerText === null ? null : (
        <div className="rounded-md border border-danger p-3 text-xs text-danger" role="alert">
          <p>{bannerText.sentence}</p>
          {bannerText.detail === null ? null : (
            <p className="mt-1 text-[11px] opacity-80">{bannerText.detail}</p>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{messages.hostLabel}</span>
        <select
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          value={selectedHostId ?? ''}
          onChange={event => selectHost(event.target.value)}
        >
          {hosts.map(host => (
            <option key={host.hostId} value={host.hostId}>
              {host.displayName}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 text-sm text-white disabled:opacity-50"
        disabled={selectedHostId === null || isMutating}
        onClick={() =>
          void runAction(async () => {
            const created = await createSession()
            openSession(created.sessionId)
            void navigate('/')
          })
        }
      >
        {messages.newSession}
      </button>

      {isLoadingSessions ? <p className="text-sm text-muted-foreground">{messages.loading}</p> : null}

      {!isLoadingSessions && sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.noSessions}</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {sessions.map(session => (
          <li key={session.sessionId} className="rounded-lg border border-border bg-surface p-3">
            {editingSessionId === session.sessionId ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground" htmlFor={`session-title-${session.sessionId}`}>
                  {messages.renamePrompt}
                </label>
                <input
                  id={`session-title-${session.sessionId}`}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  value={draftTitle}
                  onChange={event => setDraftTitle(event.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    disabled={isMutating}
                    onClick={() =>
                      void runAction(async () => {
                        await renameSession(session.sessionId, draftTitle)
                        setEditingSessionId(null)
                      })
                    }
                  >
                    {messages.confirm}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-1.5 text-xs"
                    onClick={() => setEditingSessionId(null)}
                  >
                    {messages.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{session.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatActivity(session.lastActivityAt)}
                  </span>
                </div>

                {confirmingSessionId === session.sessionId ? (
                  <div className="mt-2 flex flex-col gap-2 rounded-md border border-danger p-3">
                    <p className="text-xs text-danger">{messages.deleteConfirm}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-danger px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        disabled={isMutating}
                        onClick={() =>
                          void runAction(async () => {
                            await deleteSession(session.sessionId)
                            setConfirmingSessionId(null)
                          })
                        }
                      >
                        {messages.confirm}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-border px-3 py-1.5 text-xs"
                        onClick={() => setConfirmingSessionId(null)}
                      >
                        {messages.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs"
                      onClick={() => open(session)}
                    >
                      {messages.open}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs"
                      onClick={() => {
                        setActionFailure(null)
                        setConfirmingSessionId(null)
                        setEditingSessionId(session.sessionId)
                        setDraftTitle(session.title)
                      }}
                    >
                      {messages.renameSession}
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-danger"
                      onClick={() => {
                        setActionFailure(null)
                        setEditingSessionId(null)
                        setConfirmingSessionId(session.sessionId)
                      }}
                    >
                      {messages.deleteSession}
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
