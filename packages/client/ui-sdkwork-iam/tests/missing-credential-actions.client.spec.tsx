// @vitest-environment jsdom
/** The failure sentence's repair links: when they show and what they dispatch. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  ModelSettingsFixLink, SignInFixLink, type ModelSettingsFixInjected, type SignInFixInjected,
} from '../src/client/MissingCredentialActions.tsx'

afterEach(cleanup)

/** The label the Chat row supplies for the seat under test. */
const LABEL = '登录账号'

function signInLink(options: { code?: string; label?: string; signedIn?: boolean } = {}) {
  const signIn = vi.fn()
  const injected: SignInFixInjected = {
    signIn,
    hooks: {
      signedIn: { getSnapshot: () => options.signedIn ?? false, subscribe: () => () => {} },
    },
  }
  const props = {
    code: options.code ?? 'MISSING_CREDENTIAL',
    label: options.label ?? LABEL,
    signIn: injected.signIn,
    hooks: injected.hooks,
    useSignedIn: (selector: (signedIn: boolean) => boolean) => selector(injected.hooks.signedIn.getSnapshot()),
  }
  const rendered = render(<SignInFixLink {...props as never} />)
  return { signIn, rendered }
}

function modelSettingsLink(options: { code?: string; label?: string } = {}) {
  const configure = vi.fn()
  const injected: ModelSettingsFixInjected = { configure }
  const props = {
    code: options.code ?? 'MISSING_CREDENTIAL',
    label: options.label ?? LABEL,
    configure: injected.configure,
  }
  const rendered = render(<ModelSettingsFixLink {...props as never} />)
  return { configure, rendered }
}

describe('SignInFixLink', () => {
  it('renders the sentence label as the sign-in gesture', () => {
    const { signIn } = signInLink()
    fireEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('keeps the phrase readable but inert once a session is held', () => {
    signInLink({ signedIn: true })
    expect(screen.queryByRole('button', { name: LABEL })).toBeNull()
    expect(screen.getByText(LABEL)).not.toBeNull()
  })

  it('stays out of every other failure code', () => {
    for (const code of ['AUTH', 'QUOTA', 'INTERRUPTED', 'TRANSPORT']) {
      const { rendered } = signInLink({ code })
      expect(rendered.container.textContent).toBe('')
      rendered.unmount()
    }
  })
})

describe('ModelSettingsFixLink', () => {
  it('renders the sentence label as the Settings → Models gesture', () => {
    const { configure } = modelSettingsLink()
    fireEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(configure).toHaveBeenCalledTimes(1)
  })

  it('stays out of every other failure code', () => {
    for (const code of ['AUTH', 'QUOTA', 'INTERRUPTED', 'TRANSPORT']) {
      const { rendered } = modelSettingsLink({ code })
      expect(rendered.container.textContent).toBe('')
      rendered.unmount()
    }
  })
})
