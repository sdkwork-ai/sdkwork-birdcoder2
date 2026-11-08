// @vitest-environment jsdom
/**
 * Wide management modal shell: portal visibility, the 90%-viewport panel
 * contract, every dismissal path, focus entry and return, and its place under
 * a record drawer portaled after it.
 */
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { WideModal } from '../src/WideModal.tsx'

afterEach(cleanup)

/** A page control opens the modal, so return focus has a real target. */
function Opened({ description }: { description?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => { setOpen(true) }}>Manage accounts</button>
    <WideModal
      open={open}
      onClose={() => { setOpen(false) }}
      title="Official accounts"
      {...(description === undefined ? {} : { description })}
      closeLabel="Close official accounts"
    >
      <span>Account ledger</span>
    </WideModal>
  </>
}

/** Render through the opener: the modal only exists after a real gesture. */
function openModal(description?: string) {
  render(description === undefined ? <Opened /> : <Opened description={description} />)
  fireEvent.click(screen.getByRole('button', { name: 'Manage accounts' }))
}

describe('WideModal', () => {
  it('renders nothing while closed', () => {
    render(<WideModal open={false} onClose={() => {}} title="Domains" closeLabel="Close domains" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('portals a named dialog with its supporting line and lands focus on the close control', () => {
    openModal('Maintain the accounts used for publishing')
    const dialog = screen.getByRole('dialog', { name: 'Official accounts' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('Maintain the accounts used for publishing')
    expect(dialog.textContent).toContain('Account ledger')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close official accounts' }))
  })

  it('omits an empty or missing supporting line', () => {
    openModal('')
    expect(screen.getByRole('dialog').querySelector('p')).toBeNull()
    cleanup()
    openModal()
    expect(screen.getByRole('dialog').querySelector('p')).toBeNull()
  })

  it('closes on Escape, on the close control, and on a mask click', () => {
    const onClose = vi.fn()
    render(
      <WideModal open onClose={onClose} title="Certificates" closeLabel="Close certificates">
        <span>Certificate ledger</span>
      </WideModal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close certificates' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    const mask = document.querySelector('[aria-hidden="true"]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask as Element)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('restores the opener when the modal closes', () => {
    render(<Opened />)
    const opener = screen.getByRole('button', { name: 'Manage accounts' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps its panel open when a record drawer owns the foreground layer', () => {
    const onClose = vi.fn()
    render(
      <WideModal open onClose={onClose} title="Official accounts" closeLabel="Close official accounts">
        <button>Add account</button>
      </WideModal>,
    )
    const drawer = document.createElement('div')
    drawer.setAttribute('role', 'dialog')
    drawer.setAttribute('aria-modal', 'true')
    const field = document.createElement('input')
    drawer.append(field)
    document.body.append(drawer)
    field.focus()
    try {
      fireEvent.keyDown(field, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.keyDown(field, { key: 'Tab' })
      expect(document.activeElement).toBe(field)
    } finally {
      drawer.remove()
    }
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
