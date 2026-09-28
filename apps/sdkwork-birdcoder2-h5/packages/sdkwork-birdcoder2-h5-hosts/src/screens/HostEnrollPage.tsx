/**
 * Pairing a new host.
 *
 * The flow is deliberately two-step: the owner issues a single-use code here,
 * then pastes it into the host runtime on the target machine. Nothing about the
 * host is trusted before that exchange, so this screen never asks for an
 * address, a port, or a credential — only a display name and the platform the
 * owner says the machine runs.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import type { HostEnrollment, HostPlatform } from '@sdkwork/birdcoder2-h5-core'
import { getHostAdapters } from '@sdkwork/birdcoder2-h5-core/host'

import { resolveHostsMessages } from '../messages/hostsMessages.ts'
import { useHosts, toHostsFailure, type HostsFailure } from '../state/hostsState.tsx'

const PLATFORM_OPTIONS: readonly HostPlatform[] = ['windows', 'linux', 'macos', 'docker', 'cloud-sandbox']

export function HostEnrollPage() {
  const messages = useMemo(() => resolveHostsMessages(), [])
  const navigate = useNavigate()
  const { issueEnrollment } = useHosts()
  const [displayName, setDisplayName] = useState('')
  const [platform, setPlatform] = useState<HostPlatform>('linux')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [enrollment, setEnrollment] = useState<HostEnrollment | null>(null)
  const [failure, setFailure] = useState<HostsFailure | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'unavailable'>('idle')

  const submit = async () => {
    setIsSubmitting(true)
    setFailure(null)
    setCopyState('idle')
    try {
      const created = await issueEnrollment({
        platform,
        ...(displayName.trim().length === 0 ? {} : { displayName: displayName.trim() }),
      })
      setEnrollment(created)
    } catch (error: unknown) {
      setFailure(toHostsFailure(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyCode = async () => {
    if (enrollment === null) {
      return
    }
    try {
      await getHostAdapters().clipboard.writeText(enrollment.code)
      setCopyState('copied')
    } catch {
      // An insecure origin (a phone reaching `http://192.168.x.x`) has no
      // clipboard API at all; the code stays on screen for manual entry rather
      // than the flow failing silently.
      setCopyState('unavailable')
    }
  }

  return (
    <section className="flex flex-col gap-4 p-4" data-testid="host-enroll-page">
      <header>
        <h2 className="text-base font-semibold">{messages.enrollTitle}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{messages.enrollDescription}</p>
      </header>

      {failure !== null ? (
        <div className="rounded-md border border-danger p-3 text-xs text-danger" role="alert">
          <p>{failure.code === 'authentication' ? messages.authenticationRequired : messages.loadFailed}</p>
          {failure.code === 'authentication' ? null : (
            <p className="mt-1 text-[11px] opacity-80">{failure.message}</p>
          )}
        </div>
      ) : null}

      {enrollment === null ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{messages.displayName}</span>
            <input
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={displayName}
              placeholder={messages.displayNamePlaceholder}
              onChange={event => setDisplayName(event.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{messages.platform}</span>
            <select
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
              value={platform}
              onChange={event => setPlatform(event.target.value as HostPlatform)}
            >
              {PLATFORM_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-3 text-sm text-white disabled:opacity-50"
            disabled={isSubmitting}
          >
            {isSubmitting ? messages.submitting : messages.submit}
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div>
            <p className="text-sm font-medium">{messages.codeTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{messages.codeDescription}</p>
          </div>
          <code
            className="select-all rounded-md border border-border bg-background px-3 py-4 text-center text-lg tracking-widest"
            data-testid="host-enrollment-code"
          >
            {enrollment.code}
          </code>
          {copyState === 'unavailable' ? (
            <p className="text-xs text-warning">{messages.copyUnavailable}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs"
              onClick={() => void copyCode()}
            >
              {copyState === 'copied' ? messages.copiedCode : messages.copyCode}
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-white"
              onClick={() => void navigate('/hosts')}
            >
              {messages.done}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
