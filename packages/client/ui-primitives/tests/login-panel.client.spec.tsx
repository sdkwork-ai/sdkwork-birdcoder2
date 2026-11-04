// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { LoginPanel, type LoginAction } from '../src/LoginPanel.tsx'

afterEach(cleanup)

const welcome = {
  before: 'Welcome to ', brand: 'BirdCoder', after: '', description: 'Build potential. Explore intelligence.',
}

function actions(overrides: Partial<LoginAction> = {}): LoginAction[] {
  return [
    { id: 'sign-in', label: 'Sign in', kind: 'primary', onClick: vi.fn(), ...overrides },
    { id: 'api-key', label: 'Add API Key', kind: 'secondary', onClick: vi.fn() },
  ]
}

describe('LoginPanel', () => {
  it('renders the product identity and hands each action to its own handler', () => {
    const items = actions()
    const view = render(<LoginPanel brand="BirdCoder" logoSrc="/brand.png" welcome={welcome} actions={items} headingId="heading" />)
    expect(view.getByRole('img').getAttribute('src')).toBe('/brand.png')
    expect(view.getByRole('img').getAttribute('alt')).toBe('BirdCoder')
    const heading = view.getByRole('heading', { level: 1 })
    expect(heading.id).toBe('heading')
    expect(heading.textContent).toBe('Welcome to BirdCoder')
    expect(view.getByText('Build potential. Explore intelligence.')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Sign in' }))
    fireEvent.click(view.getByRole('button', { name: 'Add API Key' }))
    expect(items[0]!.onClick).toHaveBeenCalledOnce()
    expect(items[1]!.onClick).toHaveBeenCalledOnce()
  })

  it('renders a busy action as a disabled loader named by its busy label', () => {
    const onRetry = vi.fn()
    const view = render(<LoginPanel brand="BirdCoder" logoSrc="/brand.png" actions={[
      { id: 'retry', label: 'Sign in', kind: 'primary', busy: true, busyLabel: 'Continue in your browser' },
      { id: 'cancel', label: 'Cancel', kind: 'secondary', onClick: vi.fn() },
    ]} />)
    const retry = view.getByRole('button', { name: 'Continue in your browser' })
    expect(retry.id).toBe('retry')
    expect(retry.hasAttribute('disabled')).toBe(true)
    expect(retry.textContent).toBe('')
    expect(retry.querySelector('[data-state="ongoing"]')).not.toBeNull()
    fireEvent.click(retry)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('renders the quiet method action and the dialog dismiss control', () => {
    const onBack = vi.fn()
    const onClose = vi.fn()
    const view = render(<LoginPanel variant="dialog" brand="BirdCoder" logoSrc="/brand.png"
      actions={[{ id: 'back', label: 'Back to sign in', kind: 'text', onClick: onBack }]}
      close={{ label: 'Close', onClick: onClose }} />)
    fireEvent.click(view.getByRole('button', { name: 'Back to sign in' }))
    expect(onBack).toHaveBeenCalledOnce()
    fireEvent.click(view.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps a host-toggled welcome block mounted while hidden', () => {
    const view = render(<LoginPanel brand="BirdCoder" logoSrc="/brand.png" welcome={welcome} welcomeHidden actions={actions()} />)
    const block = view.getByText('Build potential. Explore intelligence.').closest('div')!
    expect(block.hasAttribute('hidden')).toBe(true)
  })

  it('renders method content in place of the welcome block and submits a named form', () => {
    const view = render(<form id="key-form" />)
    view.rerender(<LoginPanel brand="BirdCoder" logoSrc="/brand.png" actions={[
      { id: 'save', label: 'Save', kind: 'primary', form: 'key-form' },
    ]}>
      <p>Add an API key to get started</p>
    </LoginPanel>)
    expect(view.getByText('Add an API key to get started')).toBeTruthy()
    expect(view.queryByRole('heading')).toBeNull()
    const save = view.getByRole('button', { name: 'Save' })
    expect(save.getAttribute('type')).toBe('submit')
    expect(save.getAttribute('form')).toBe('key-form')
  })
})
