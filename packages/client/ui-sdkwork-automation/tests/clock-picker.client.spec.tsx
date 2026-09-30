// @vitest-environment jsdom
/**
 * Clock picker spec: the three-column clock the time row anchors.
 *
 * The picker owns only its panel, so every case renders the row's own
 * composition around it: a trigger button that shows the staged 24-hour time
 * and anchors the panel, plus the Escape guard the rule row places above both,
 * which closes the panel and hands focus back to the trigger. The panel itself
 * is a portal, so its columns are queried through the document.
 */
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { ClockPicker, type ClockPickerProps } from '../src/client/ClockPicker.tsx'

/**
 * Key-echoing locale stand-in: copy renders as its own dictionary key, so an
 * assertion names the key the panel asked for.
 */
const t = ((key: string) => key) as ClockPickerProps['t']

/**
 * The scroll-to-value spy the panel calls on open. jsdom implements no
 * scrolling, so the standard method is installed for every case; the columns
 * that are not rendered simply have nothing to scroll.
 */
let scroll = vi.fn()

beforeEach(() => {
  scroll = vi.fn()
  Element.prototype.scrollIntoView = scroll
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

/** Inputs of the row composition the picker is mounted in. */
interface RowProps {
  /** The staged clock text the row starts with. */
  readonly value: string
  /** Whether the row offers the seconds column, as a cron rule's form does not. */
  readonly seconds?: boolean
  /** Whether the row is read-only, as an inactive task's row is. */
  readonly disabled?: boolean
  /** Receives every clock the panel stages. */
  readonly onPick?: (time: string) => void
}

/**
 * The time row around the picker.
 * @param props - the staged clock, the seconds switch, the read-only flag, and the pick spy.
 * @returns the row: the trigger, the panel it anchors, and the Escape guard.
 */
function Row({ value, seconds = true, disabled = false, onPick }: RowProps) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [staged, setStaged] = useState(value)
  return (
    <span onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open) return
      setOpen(false)
      anchorRef.current?.focus()
    }}>
      <button
        ref={anchorRef}
        type="button"
        disabled={disabled}
        aria-label="timing.time"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(current => !current) }}
      >{staged}</button>
      <ClockPicker
        open={open}
        anchorRef={anchorRef}
        value={staged}
        onPick={(time) => { setStaged(time); onPick?.(time) }}
        onClose={() => { setOpen(false) }}
        seconds={seconds}
        t={t}
      />
    </span>
  )
}

/**
 * Open one row's clock panel.
 * @param props - the row's inputs.
 * @returns the rendered row, its trigger, and the panel's column and option lookups.
 */
function opened(props: RowProps) {
  const view = render(<Row {...props} />)
  const trigger = view.getByRole('button', { name: 'timing.time' })
  fireEvent.click(trigger)
  const column = (label: string): HTMLElement => view.getByRole('listbox', { name: label })
  const option = (label: string, name: string): HTMLElement => within(column(label)).getByRole('option', { name })
  return { view, trigger, column, option }
}

describe('ClockPicker', () => {
  it('shows the staged 24-hour time and opens on it', () => {
    const view = render(<Row value="09:05:07" />)
    const trigger = view.getByRole('button', { name: 'timing.time' })
    expect(trigger.textContent).toBe('09:05:07')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByRole('dialog')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByRole('dialog', { name: 'timing.time' })).toBeDefined()
    const marked: readonly (readonly [string, number, string])[] = [
      ['timing.hour', 24, '09'], ['timing.minute', 60, '05'], ['timing.second', 60, '07'],
    ]
    for (const [label, size, value] of marked) {
      const options = within(view.getByRole('listbox', { name: label })).getAllByRole('option')
      expect(options).toHaveLength(size)
      expect(within(view.getByRole('listbox', { name: label }))
        .getAllByRole('option', { selected: true }).map(option => option.textContent)).toEqual([value])
    }
    // The keyboard starts in the hour column, on the staged hour.
    expect(document.activeElement).toBe(within(view.getByRole('listbox', { name: 'timing.hour' }))
      .getByRole('option', { name: '09' }))
  })

  it('opens a stored minute-precision clock as whole seconds', () => {
    const { option } = opened({ value: '10:23' })
    expect(within(option('timing.minute', '23').parentElement as HTMLElement)
      .getAllByRole('option', { selected: true }).map(entry => entry.textContent)).toEqual(['23'])
    expect(within(option('timing.second', '00').parentElement as HTMLElement)
      .getAllByRole('option', { selected: true }).map(entry => entry.textContent)).toEqual(['00'])
    expect(document.activeElement).toBe(option('timing.hour', '10'))
  })

  it('opens at midnight when the staged text states no clock', () => {
    const { trigger, option } = opened({ value: 'noon' })
    expect(trigger.textContent).toBe('noon')
    expect(document.activeElement).toBe(option('timing.hour', '00'))
    fireEvent.keyDown(option('timing.hour', '00'), { key: 'Enter' })
    expect(trigger.textContent).toBe('00:00:00')
  })

  it('opens on the first option of a value its columns do not list', () => {
    const { column, option } = opened({ value: '99:99:99' })
    expect(within(column('timing.hour')).queryAllByRole('option', { selected: true })).toHaveLength(0)
    expect(document.activeElement).toBe(option('timing.hour', '00'))
    // Every column still keeps one row the keyboard can reach.
    expect(option('timing.minute', '00').getAttribute('tabindex')).toBe('0')
    expect(option('timing.second', '00').getAttribute('tabindex')).toBe('0')
  })

  it('walks the open column with the arrow keys', () => {
    const { option } = opened({ value: '09:05:07' })
    fireEvent.keyDown(option('timing.hour', '09'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(option('timing.hour', '10'))
    fireEvent.keyDown(option('timing.hour', '10'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(option('timing.hour', '09'))
    // Home and End reach the column's ends, and the walk clamps there.
    fireEvent.keyDown(option('timing.hour', '09'), { key: 'Home' })
    expect(document.activeElement).toBe(option('timing.hour', '00'))
    fireEvent.keyDown(option('timing.hour', '00'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(option('timing.hour', '00'))
    fireEvent.keyDown(option('timing.hour', '00'), { key: 'End' })
    expect(document.activeElement).toBe(option('timing.hour', '23'))
    fireEvent.keyDown(option('timing.hour', '23'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(option('timing.hour', '23'))
    // Any other key leaves the keyboard where it is.
    fireEvent.keyDown(option('timing.hour', '23'), { key: 'PageDown' })
    expect(document.activeElement).toBe(option('timing.hour', '23'))
  })

  it('moves between columns with the left and right arrows, staying inside the target column', () => {
    const { option } = opened({ value: '09:05:07' })
    fireEvent.keyDown(option('timing.hour', '09'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(option('timing.minute', '09'))
    fireEvent.keyDown(option('timing.minute', '09'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(option('timing.second', '09'))
    // Nothing lies right of the seconds column.
    fireEvent.keyDown(option('timing.second', '09'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(option('timing.second', '09'))
    fireEvent.keyDown(option('timing.second', '09'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(option('timing.minute', '09'))
    // The hour column is the shortest, so the row carried into it stays inside it.
    fireEvent.keyDown(option('timing.minute', '59'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(option('timing.hour', '23'))
    // Nothing lies left of the hour column.
    option('timing.hour', '00').focus()
    fireEvent.keyDown(option('timing.hour', '00'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(option('timing.hour', '00'))
  })

  it('stages the option the keyboard is on with Enter and with Space', () => {
    const onPick = vi.fn()
    const { trigger, option } = opened({ value: '09:05:07', onPick })
    fireEvent.keyDown(option('timing.hour', '11'), { key: 'Enter' })
    expect(onPick).toHaveBeenLastCalledWith('11:05:07')
    fireEvent.keyDown(option('timing.minute', '30'), { key: ' ' })
    expect(onPick).toHaveBeenLastCalledWith('11:30:07')
    expect(trigger.textContent).toBe('11:30:07')
    expect(option('timing.second', '07').getAttribute('aria-selected')).toBe('true')
  })

  it('stages the option a click picks and leaves the keyboard on it', () => {
    const onPick = vi.fn()
    const { trigger, option } = opened({ value: '09:05:07', onPick })
    fireEvent.click(option('timing.second', '42'))
    expect(onPick).toHaveBeenCalledExactlyOnceWith('09:05:42')
    expect(trigger.textContent).toBe('09:05:42')
    expect(document.activeElement).toBe(option('timing.second', '42'))
    expect(option('timing.second', '42').getAttribute('aria-selected')).toBe('true')
  })

  it('scrolls every column to the staged value when it opens', () => {
    opened({ value: '09:05:07' })
    expect(scroll).toHaveBeenCalledTimes(3)
    expect(scroll).toHaveBeenNthCalledWith(1, { block: 'nearest' })
  })

  it('offers no seconds column when the form hides it, keeping the staged seconds', () => {
    const onPick = vi.fn()
    const { view, trigger, option } = opened({ value: '09:05:07', seconds: false, onPick })
    expect(view.getAllByRole('listbox')).toHaveLength(2)
    expect(view.queryByRole('listbox', { name: 'timing.second' })).toBeNull()

    fireEvent.keyDown(option('timing.hour', '11'), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledExactlyOnceWith('11:05:07')
    expect(trigger.textContent).toBe('11:05:07')
    // The minutes column is now the last one the panel offers.
    option('timing.minute', '05').focus()
    fireEvent.keyDown(option('timing.minute', '05'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(option('timing.minute', '05'))
  })

  it('closes on Escape and hands focus back to the trigger', () => {
    const { view, trigger, option } = opened({ value: '09:05:07' })
    fireEvent.keyDown(option('timing.second', '07'), { key: 'Escape' })
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.queryByRole('listbox')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when the pointer presses outside the trigger and the panel', () => {
    const { view, option } = opened({ value: '09:05:07' })
    expect(option('timing.hour', '09')).toBeDefined()
    fireEvent.pointerDown(document.body)
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.queryByRole('listbox')).toBeNull()
  })

  it('keeps a read-only row shut', () => {
    const view = render(<Row value="09:05:07" disabled />)
    const trigger = view.getByRole('button', { name: 'timing.time' })
    expect(trigger).toHaveProperty('disabled', true)
    fireEvent.click(trigger)
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.queryByRole('listbox')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})
