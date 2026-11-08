// @vitest-environment jsdom
/**
 * Left drawer shell: portal visibility, the header contract, every dismissal
 * path, focus entry and return, and its place under a dialog portaled later by
 * an embedded surface.
 */
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Drawer } from '../src/Drawer.tsx'

afterEach(cleanup)

/** A page control opens the drawer, so return focus has a real target. */
function Opened({ description }: { description?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => { setOpen(true) }}>Manage accounts</button>
    <Drawer
      open={open}
      onClose={() => { setOpen(false) }}
      title="Official accounts"
      {...(description === undefined ? {} : { description })}
      closeLabel="Close official accounts"
    >
      <span>Account ledger</span>
    </Drawer>
  </>
}

/** Render through the opener: the drawer only exists after a real gesture. */
function openDrawer(description?: string) {
  render(description === undefined ? <Opened /> : <Opened description={description} />)
  fireEvent.click(screen.getByRole('button', { name: 'Manage accounts' }))
}

describe('Drawer', () => {
  it('renders nothing while closed', () => {
    render(<Drawer open={false} onClose={() => {}} title="Domains" closeLabel="Close domains" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('portals a named dialog with its supporting line and lands focus on the close control', () => {
    openDrawer('Maintain the accounts used for publishing')
    const dialog = screen.getByRole('dialog', { name: 'Official accounts' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('Maintain the accounts used for publishing')
    expect(dialog.textContent).toContain('Account ledger')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close official accounts' }))
  })

  it('omits an empty or missing supporting line', () => {
    openDrawer('')
    expect(screen.getByRole('dialog').querySelector('p')).toBeNull()
    cleanup()
    openDrawer()
    expect(screen.getByRole('dialog').querySelector('p')).toBeNull()
  })

  it('closes on Escape, on the close control, and on a mask click', () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Certificates" closeLabel="Close certificates">
        <span>Certificate ledger</span>
      </Drawer>,
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

  it('restores the opener when the drawer closes', () => {
    render(<Opened />)
    const opener = screen.getByRole('button', { name: 'Manage accounts' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('yields Escape and Tab to a dialog an embedded surface portals after it', () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Official accounts" closeLabel="Close official accounts">
        <button>Add account</button>
      </Drawer>,
    )
    const embedded = document.createElement('div')
    embedded.setAttribute('role', 'dialog')
    embedded.setAttribute('aria-modal', 'true')
    const field = document.createElement('input')
    embedded.append(field)
    document.body.append(embedded)
    field.focus()
    try {
      fireEvent.keyDown(field, { key: 'Escape' })
      expect(onClose).not.toHaveBeenCalled()
      fireEvent.keyDown(field, { key: 'Tab' })
      expect(document.activeElement).toBe(field)
    } finally {
      embedded.remove()
    }
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
