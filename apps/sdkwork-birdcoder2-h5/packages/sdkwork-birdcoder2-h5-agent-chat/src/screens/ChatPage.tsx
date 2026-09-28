/**
 * The conversation screen.
 *
 * Everything on this page is a view of one host's event log: the transcript is
 * the durable turn records, and the streaming text is the `assistant-delta`
 * events applied since the local watermark. The page never calls a transport —
 * it drives {@link useConversation}.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { AgentTurn } from '@sdkwork/birdcoder2-h5-core'

import { resolveAgentChatMessages, resolveFailureBanner } from '../messages/agentChatMessages.ts'
import { toConversationFailure, useConversation, type ConversationFailure } from '../state/conversationState.tsx'

function turnBubbleClass(role: AgentTurn['role']): string {
  return role === 'user'
    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-white'
    : 'mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface px-3 py-2 text-sm'
}

function turnStatusNote(turn: AgentTurn): 'failed' | 'cancelled' | null {
  if (turn.status === 'failed') {
    return 'failed'
  }
  if (turn.status === 'cancelled') {
    return 'cancelled'
  }
  return null
}

export function ChatPage() {
  const messages = useMemo(() => resolveAgentChatMessages(), [])
  const navigate = useNavigate()
  const {
    hosts,
    isLoadingHosts,
    selectedHostId,
    selectHost,
    activeSessionId,
    activeSession,
    turns,
    liveText,
    isStreaming,
    isLoadingTranscript,
    failure,
    createSession,
    sendTurn,
    cancelActiveTurn,
  } = useConversation()

  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [actionFailure, setActionFailure] = useState<ConversationFailure | null>(null)

  const canSend = input.trim().length > 0 && activeSessionId !== null && !isSending

  const startSession = async () => {
    setActionFailure(null)
    try {
      await createSession()
    } catch (error: unknown) {
      setActionFailure(toConversationFailure(error))
    }
  }

  const submit = async () => {
    const content = input.trim()
    if (content.length === 0) {
      return
    }
    setIsSending(true)
    setActionFailure(null)
    try {
      await sendTurn(content)
      setInput('')
    } catch (error: unknown) {
      setActionFailure(toConversationFailure(error))
    } finally {
      setIsSending(false)
    }
  }

  const stop = async () => {
    setIsCancelling(true)
    setActionFailure(null)
    try {
      await cancelActiveTurn()
    } catch (error: unknown) {
      setActionFailure(toConversationFailure(error))
    } finally {
      setIsCancelling(false)
    }
  }

  const banner = actionFailure ?? failure
  // `actionFailure` is only ever set by a handler this screen invoked, so its
  // presence is what tells a user-triggered failure from a provider read.
  const bannerText = banner === null ? null : resolveFailureBanner(messages, banner, actionFailure !== null)

  if (!isLoadingHosts && hosts.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 p-6 text-center" data-testid="chat-page-no-host">
        <p className="text-sm font-medium">{messages.noHostTitle}</p>
        <p className="text-xs text-muted-foreground">{messages.noHostDescription}</p>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm text-white"
          onClick={() => void navigate('/hosts')}
        >
          {messages.goToHosts}
        </button>
      </section>
    )
  }

  return (
    <section className="flex min-h-full flex-col gap-3 p-4" data-testid="chat-page">
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

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto" data-testid="chat-transcript">
        {isLoadingTranscript ? <p className="text-sm text-muted-foreground">{messages.loading}</p> : null}

        {!isLoadingTranscript && activeSessionId === null ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center">
            <p className="text-sm font-medium">{messages.newSessionTitle}</p>
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm text-white"
              onClick={() => void startSession()}
            >
              {messages.newSession}
            </button>
          </div>
        ) : null}

        {activeSessionId !== null && !isLoadingTranscript && turns.length === 0 && liveText.length === 0 ? (
          <p className="text-sm text-muted-foreground">{messages.emptyHistory}</p>
        ) : null}

        {turns.map((turn) => {
          const note = turnStatusNote(turn)
          return (
            <article key={turn.turnId} className={turnBubbleClass(turn.role)}>
              <p className="whitespace-pre-wrap break-words">{turn.content ?? ''}</p>
              {note === null ? null : (
                <p className="mt-1 text-[11px] text-warning">
                  {note === 'failed' ? messages.turnFailed : messages.turnCancelled}
                </p>
              )}
            </article>
          )
        })}

        {liveText.length > 0 ? (
          <article className="mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface px-3 py-2 text-sm">
            <p className="whitespace-pre-wrap break-words">{liveText}</p>
          </article>
        ) : null}

        {isStreaming && liveText.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="chat-streaming">
            {messages.streaming}
          </p>
        ) : null}
      </div>

      {activeSessionId !== null ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <textarea
            className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm"
            rows={2}
            placeholder={messages.inputPlaceholder}
            value={input}
            onChange={event => setInput(event.target.value)}
          />
          {isStreaming ? (
            <button
              type="button"
              className="rounded-md border border-border px-3 py-3 text-xs disabled:opacity-50"
              disabled={isCancelling}
              onClick={() => void stop()}
            >
              {isCancelling ? messages.cancelling : messages.cancel}
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-3 text-sm text-white disabled:opacity-50"
              disabled={!canSend}
            >
              {isSending ? messages.sending : messages.send}
            </button>
          )}
        </form>
      ) : null}

      {activeSession !== null ? (
        <p className="truncate text-[11px] text-muted-foreground">{activeSession.title}</p>
      ) : null}
    </section>
  )
}
