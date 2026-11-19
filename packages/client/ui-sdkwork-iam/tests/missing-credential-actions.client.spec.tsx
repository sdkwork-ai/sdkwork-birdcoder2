// @vitest-environment jsdom
/** The Chat failure row's credential fixes: when they show and what they dispatch. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  MissingCredentialActions, type MissingCredentialActionsInjected,
} from '../src/client/MissingCredentialActions.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

function fixes(options: { code?: string | undefined; signedIn?: boolean } = {}) {
  const signIn = vi.fn()
  const configure = vi.fn()
  const injected: MissingCredentialActionsInjected = {
    signIn,
    configure,
    hooks: {
      signedIn: { getSnapshot: () => options.signedIn ?? false, subscribe: () => () => {} },
    },
  }
  const code = options.code === undefined ? 'MISSING_CREDENTIAL' : options.code
  const props = {
    code,
    signIn: injected.signIn,
    configure: injected.configure,
    hooks: injected.hooks,
    useSignedIn: (selector: (signedIn: boolean) => boolean) => selector(injected.hooks.signedIn.getSnapshot()),
    t,
  }
  const rendered = render(<MissingCredentialActions {...props as never} />)
  return { signIn, configure, rendered }
}

describe('MissingCredentialActions', () => {
  it('offers both documented fixes for a missing credential', () => {
    fixes()
    expect(screen.getByRole('button', { name: zh['turnError.signIn'] })).not.toBeNull()
    expect(screen.getByRole('button', { name: zh['turnError.configure'] })).not.toBeNull()
  })

  it('raises the entry modal on a sign-in click and opens the Models page on a configure click', () => {
    const { signIn, configure } = fixes()
    fireEvent.click(screen.getByRole('button', { name: zh['turnError.signIn'] }))
    expect(signIn).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: zh['turnError.configure'] }))
    expect(configure).toHaveBeenCalledTimes(1)
  })

  it('keeps the configure gesture the only repair once a session is held', () => {
    fixes({ signedIn: true })
    expect(screen.queryByRole('button', { name: zh['turnError.signIn'] })).toBeNull()
    expect(screen.getByRole('button', { name: zh['turnError.configure'] })).not.toBeNull()
  })

  it('stays out of every other failure code', () => {
    for (const code of ['AUTH', 'QUOTA', 'INTERRUPTED', 'TRANSPORT']) {
      const { rendered } = fixes({ code })
      expect(rendered.container.textContent).toBe('')
      rendered.unmount()
    }
  })
})
