// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MarketsDialog } from '../src/client/MarketsDialog.tsx'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  document.body.removeAttribute('data-ds-dark-theme')
})

describe('MarketsDialog', () => {
  it('portals the centered card onto the document body with modal semantics', () => {
    const view = render(
      <div data-page=""><MarketsDialog open onClose={() => {}} title="Detail" closeLabel="Close"><p>body</p></MarketsDialog></div>,
    )
    const dialog = view.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('Detail')
    // The card leaves the page subtree, so a clipping/containment host panel
    // cannot offset or cut the overlay.
    expect(document.body.contains(dialog)).toBe(true)
    expect(dialog.closest('[data-page]')).toBeNull()
    expect(document.querySelector('[data-markets-dialog]')?.contains(dialog)).toBe(true)
    const close = view.getByRole('button', { name: 'Close' })
    expect(close.getAttribute('type')).toBe('button')
  })

  it('closes on Escape, the mask, and the close button', () => {
    const onClose = vi.fn()
    const view = render(
      <MarketsDialog open onClose={onClose} title="Detail" closeLabel="Close"><p>body</p></MarketsDialog>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(view.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.mouseDown(document.querySelector('[data-markets-dialog]')!)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('focuses the marked control and restores focus on close', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const view = render(
      <MarketsDialog open onClose={() => {}} title="Detail" closeLabel="Close">
        <input data-modal-autofocus aria-label="field" />
      </MarketsDialog>,
    )
    await waitFor(() => { expect(document.activeElement?.getAttribute('aria-label')).toBe('field') })
    view.unmount()
    await waitFor(() => { expect(document.activeElement).toBe(opener) })
    opener.remove()
  })
})
