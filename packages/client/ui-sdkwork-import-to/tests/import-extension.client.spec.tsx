// @vitest-environment jsdom
/**
 * Seam behavior: the plugin publishes sixteen rows on `globalThis`, the
 * console-facing reader sees the same object, disposal restores the previous
 * value, and a selection opens the import dialog.
 */
import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { installQuickImportExtension, readQuickImportExtension } from '../src/client/extension.tsx'
import { closeImportToDialog } from '../src/client/dialog/overlay.ts'

afterEach(() => {
  closeImportToDialog()
  cleanup()
})

const selection = {
  targetId: 'codex',
  key: { id: 'key-1', displayName: 'Cloud Router', maskedKey: 'sk-***-123', rawKey: 'sk-test-123' },
  endpoints: {
    anthropicBaseUrl: 'https://relay.example.com/anthropic',
    openAiBaseUrl: 'https://relay.example.com/v1',
    geminiBaseUrl: 'https://relay.example.com/gemini',
  },
  homepage: 'https://relay.example.com',
}

describe('quick-import extension', () => {
  it('publishes the sixteen menu rows', () => {
    const dispose = installQuickImportExtension()
    const extension = readQuickImportExtension()
    expect(extension).not.toBeNull()
    expect(extension?.targets).toHaveLength(16)
    expect(extension?.targets[0]?.label).toBe('Claude Code')
    expect(extension?.targets[15]?.label).toBe('WorkBuddy')
    dispose()
    expect(readQuickImportExtension()).toBeNull()
  })

  it('restores an earlier registration on disposal', () => {
    const previous = {
      targets: [{ id: 'claude', label: 'Claude Code' }],
      onSelect: () => {},
    }
    const symbol = Symbol.for('sdkwork.cloudrouter.quick-import-extension')
    Reflect.set(globalThis, symbol, previous)
    const dispose = installQuickImportExtension()
    expect(readQuickImportExtension()).not.toBe(previous)
    dispose()
    expect(readQuickImportExtension()).toBe(previous)
    Reflect.set(globalThis, symbol, undefined)
  })

  it('uses the client locale for the dialog copy', async () => {
    const dispose = installQuickImportExtension(() => 'zh')
    readQuickImportExtension()?.onSelect(selection)
    await waitFor(() => {
      expect(screen.getByText('导入到 Codex')).toBeTruthy()
    })
    dispose()
  })

  it('opens the dialog for a menu selection', async () => {
    const dispose = installQuickImportExtension()
    readQuickImportExtension()?.onSelect(selection)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
    })
    expect(screen.getByText('Import into Codex')).toBeTruthy()
    expect(document.querySelector('[data-sdkwork-import-to-host]')).not.toBeNull()
    dispose()
  })
})
