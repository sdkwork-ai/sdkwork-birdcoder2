// @vitest-environment jsdom
/**
 * Dialog behavior: the form drives a fresh plan, the file cards show the exact
 * projection, a format switch rewrites the target's own field, and a target
 * that needs a model withholds the plan until one is entered.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImportToDialog } from '../src/client/dialog/ImportToDialog.tsx'
import type { QuickImportExtensionSelection } from '../src/client/extension.tsx'

afterEach(cleanup)

const selection: QuickImportExtensionSelection = {
  targetId: 'claude',
  key: { id: 'key-1', displayName: 'Cloud Router', maskedKey: 'sk-***-123', rawKey: 'sk-test-123' },
  endpoints: {
    anthropicBaseUrl: 'https://relay.example.com/anthropic',
    openAiBaseUrl: 'https://relay.example.com/v1',
    geminiBaseUrl: 'https://relay.example.com/gemini',
  },
  homepage: 'https://relay.example.com',
}

/** Selection for another target, keeping the same key. */
function selectionFor(targetId: string): QuickImportExtensionSelection {
  return { ...selection, targetId }
}

describe('import dialog', () => {
  it('shows the target title, the source key, and the projected file path', () => {
    render(<ImportToDialog selection={selection} onClose={() => {}} platform="win32" />)
    expect(screen.getByText('Import into Claude Code')).toBeTruthy()
    expect(screen.getByText('Cloud Router')).toBeTruthy()
    expect(screen.getByText('sk-***-123')).toBeTruthy()
    expect(screen.getByText('%USERPROFILE%\\.claude\\settings.json')).toBeTruthy()
    expect(document.body.textContent).toContain('"ANTHROPIC_AUTH_TOKEN": "sk-test-123"')
  })

  it('links to CC Switch with the same provider fields', () => {
    render(<ImportToDialog selection={selection} onClose={() => {}} platform="win32" />)
    const link = screen.getByRole('link', { name: 'Open in CC Switch' })
    const href = link.getAttribute('href') ?? ''
    expect(href.startsWith('ccswitch://v1/import?')).toBe(true)
    expect(href).toContain('app=claude')
    expect(href).toContain('apiFormat=anthropic')
    expect(href).toContain('enabled=true')
  })

  it('rewrites the target field when the protocol changes', () => {
    const { container } = render(<ImportToDialog selection={selectionFor('codex')} onClose={() => {}} platform="win32" />)
    expect(container.textContent).toContain('wire_api = "responses"')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'openai_chat' } })
    expect(container.textContent).toContain('wire_api = "chat"')
  })

  it('withholds a plan until a required model is entered', () => {
    const { container } = render(<ImportToDialog selection={selectionFor('pi')} onClose={() => {}} platform="win32" />)
    expect(container.textContent).toContain('Enter a model to generate the files.')
    fireEvent.change(screen.getByPlaceholderText('This target needs a model'), { target: { value: 'm1' } })
    expect(container.textContent).toContain('%USERPROFILE%\\.pi\\agent\\models.json')
    expect(container.textContent).toContain('"api": "openai-completions"')
  })

  it('closes through the close button', () => {
    const onClose = vi.fn()
    render(<ImportToDialog selection={selection} onClose={onClose} platform="win32" />)
    fireEvent.click(screen.getByText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
