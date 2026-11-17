// @vitest-environment jsdom
/** The BirdCoder provider card's sign-in notice: when it shows and what it dispatches. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RelayProviderHint, type RelayProviderHintInjected } from '../src/client/RelayProviderHint.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

const RELAY = {
  provider: 'birdcoder',
  displayName: 'BirdCoder',
  settingsNs: 'llm-pi-ai',
  settingsPath: ['providers', 'birdcoder'],
  active: true,
}

function notice(options: {
  provider?: typeof RELAY
  keyConfigured?: boolean
  signedIn?: boolean
} = {}) {
  const requestSignIn = vi.fn(async () => true)
  const injected: RelayProviderHintInjected = {
    requestSignIn,
    signedIn: () => options.signedIn ?? false,
  }
  const props = {
    provider: options.provider ?? RELAY,
    configured: true,
    keyConfigured: options.keyConfigured ?? false,
    ...injected,
    t,
  }
  const rendered = render(<RelayProviderHint {...props as never} />)
  return { requestSignIn, rendered }
}

describe('RelayProviderHint', () => {
  it('points an unconfigured BirdCoder card at the sign-in that fills its key', () => {
    notice()
    expect(screen.getByText(zh['relay.signInHint'])).not.toBeNull()
    expect(screen.getByRole('button', { name: zh['relay.signIn'] })).not.toBeNull()
  })

  it('asks the IAM service for a session when the gesture is used', () => {
    const { requestSignIn } = notice()
    fireEvent.click(screen.getByRole('button', { name: zh['relay.signIn'] }))
    expect(requestSignIn).toHaveBeenCalledTimes(1)
  })

  it('stays out of the way once the relay credential is configured', () => {
    const { rendered } = notice({ keyConfigured: true })
    expect(rendered.container.textContent).toBe('')
  })

  it('stays out of the way while a session is already held', () => {
    const { rendered } = notice({ signedIn: true })
    expect(rendered.container.textContent).toBe('')
  })

  it('stays out of every other provider card', () => {
    const { rendered } = notice({
      provider: { ...RELAY, provider: 'anthropic', displayName: 'Anthropic' },
    })
    expect(rendered.container.textContent).toBe('')
  })
})
