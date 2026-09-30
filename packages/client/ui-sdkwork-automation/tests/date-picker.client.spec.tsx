// @vitest-environment jsdom
/**
 * Date picker spec: the month calendar the date row anchors.
 *
 * The picker owns only its panel, so every case renders the row's own
 * composition around it: a trigger button that shows the staged date as
 * `YYYY/MM/DD` and anchors the panel, plus the Escape guard the rule row places
 * above both, which closes the panel and hands focus back to the trigger. The
 * panel itself is a portal, so its parts are queried through the document.
 */
import { useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { IconCalendarOutlineRegular } from '../src/client/CalendarIcon.tsx'
import { DatePicker, type DatePickerProps } from '../src/client/DatePicker.tsx'

/** The pinned clock every case reads: 2026-10-14, mid-day, in the host's own zone. */
const TODAY = new Date(2026, 9, 14, 12, 0, 0)

/**
 * Key-echoing locale stand-in: copy renders as its own dictionary key, so an
 * assertion names the key the panel asked for. `time.locale` is the one
 * exception — its value is an `Intl` locale tag rather than copy, and the echoed
 * key is not a language tag.
 */
const t = ((key: string) => (key === 'time.locale' ? 'en' : key)) as DatePickerProps['t']

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** Inputs of the row composition the picker is mounted in. */
interface RowProps {
  /** The staged ISO date the row starts with. */
  readonly value: string
  /** Whether the row is read-only, as an inactive task's row is. */
  readonly disabled?: boolean
  /** Receives every date the panel stages. */
  readonly onPick?: (date: string) => void
}

/**
 * The date row around the picker.
 * @param props - the staged date, the read-only flag, and the pick spy.
 * @returns the row: the trigger, the panel it anchors, and the Escape guard.
 */
function Row({ value, disabled = false, onPick }: RowProps) {
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
        aria-label="timing.date"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(current => !current) }}
      >{staged.replaceAll('-', '/')}</button>
      <DatePicker
        open={open}
        anchorRef={anchorRef}
        value={staged}
        onPick={(date) => { setStaged(date); onPick?.(date) }}
        onClose={() => { setOpen(false) }}
        t={t}
      />
    </span>
  )
}

describe('DatePicker', () => {
  it('shows the staged date as YYYY/MM/DD and opens the grid on that day', () => {
    const view = render(<Row value="2026-10-05" />)
    const trigger = view.getByRole('button', { name: 'timing.date' })
    expect(trigger.textContent).toBe('2026/10/05')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByRole('dialog')).toBeNull()

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(view.getByRole('dialog', { name: 'timing.date' })).toBeDefined()
    const grid = view.getByRole('grid', { name: 'October 2026' })
    expect(within(grid).getAllByRole('columnheader').map(header => header.textContent)).toEqual([
      'frequency.weekday.1', 'frequency.weekday.2', 'frequency.weekday.3', 'frequency.weekday.4',
      'frequency.weekday.5', 'frequency.weekday.6', 'frequency.weekday.7',
    ])
    // The staged day is the marked cell and holds the keyboard; today's cell
    // carries the date marker.
    const marked = within(grid).getAllByRole('gridcell', { selected: true })
    expect(marked.map(cell => cell.textContent)).toEqual(['5'])
    expect(marked[0]?.getAttribute('tabindex')).toBe('0')
    expect(document.activeElement).toBe(marked[0])
    expect(within(grid).getByRole('gridcell', { current: 'date' }).textContent).toBe('14')
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(31)
  })

  it('opens on today when the staged text is not an ISO calendar date', () => {
    const view = render(<Row value="" />)
    fireEvent.click(view.getByRole('button', { name: 'timing.date' }))
    const grid = view.getByRole('grid', { name: 'October 2026' })
    const today = within(grid).getByRole('gridcell', { current: 'date' })
    expect(today.textContent).toBe('14')
    expect(document.activeElement).toBe(today)
    expect(within(grid).queryByRole('gridcell', { selected: true })).toBeNull()
  })

  it('moves the shown month with the previous and next buttons, clamping the focused day', () => {
    const view = render(<Row value="2026-10-31" />)
    fireEvent.click(view.getByRole('button', { name: 'timing.date' }))
    expect(document.activeElement?.textContent).toBe('31')

    fireEvent.click(view.getByRole('button', { name: 'timing.nextMonth' }))
    const november = view.getByRole('grid', { name: 'November 2026' })
    expect(within(november).getAllByRole('gridcell')).toHaveLength(30)
    // The month is shorter than the focused day, so the keyboard lands on its last day.
    expect(document.activeElement).toBe(within(november).getByRole('gridcell', { name: '30' }))
    expect(within(november).queryByRole('gridcell', { current: 'date' })).toBeNull()

    fireEvent.click(view.getByRole('button', { name: 'timing.prevMonth' }))
    expect(view.getByRole('grid', { name: 'October 2026' })).toBeDefined()
    expect(document.activeElement?.textContent).toBe('30')
  })

  it('opens again on the staged day after another month was shown', () => {
    const view = render(<Row value="2026-10-05" />)
    const trigger = view.getByRole('button', { name: 'timing.date' })
    fireEvent.click(trigger)
    fireEvent.click(view.getByRole('button', { name: 'timing.nextMonth' }))
    expect(view.getByRole('grid', { name: 'November 2026' })).toBeDefined()

    fireEvent.keyDown(within(view.getByRole('grid')).getByRole('gridcell', { name: '5' }), { key: 'Escape' })
    expect(view.queryByRole('grid')).toBeNull()
    fireEvent.click(trigger)
    expect(view.getByRole('grid', { name: 'October 2026' })).toBeDefined()
  })

  it('stages the day a click picks and leaves the keyboard on it', () => {
    const onPick = vi.fn()
    const view = render(<Row value="2026-10-05" onPick={onPick} />)
    fireEvent.click(view.getByRole('button', { name: 'timing.date' }))
    const grid = view.getByRole('grid', { name: 'October 2026' })

    fireEvent.click(within(grid).getByRole('gridcell', { name: '15' }))
    expect(onPick).toHaveBeenCalledExactlyOnceWith('2026-10-15')
    expect(view.getByRole('button', { name: 'timing.date' }).textContent).toBe('2026/10/15')
    // The panel stays open: closing after a pick is the row's own step.
    const reshown = view.getByRole('grid', { name: 'October 2026' })
    expect(within(reshown).getAllByRole('gridcell', { selected: true }).map(cell => cell.textContent)).toEqual(['15'])
    expect(document.activeElement).toBe(within(reshown).getByRole('gridcell', { name: '15' }))
  })

  it('walks the grid with the arrow keys', () => {
    const view = render(<Row value="2026-10-01" />)
    fireEvent.click(view.getByRole('button', { name: 'timing.date' }))
    const cell = (day: string): HTMLElement => within(view.getByRole('grid')).getByRole('gridcell', { name: day })
    expect(document.activeElement).toBe(cell('1'))

    // The first day clamps an earlier step; a later step walks by day, by week,
    // and clamps again at the month's last day.
    fireEvent.keyDown(cell('1'), { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(cell('1'))
    fireEvent.keyDown(cell('1'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cell('2'))
    fireEvent.keyDown(cell('2'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cell('9'))
    fireEvent.keyDown(cell('9'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(cell('2'))
    fireEvent.keyDown(cell('31'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cell('31'))
    // Any other key leaves the keyboard where it is.
    cell('2').focus()
    fireEvent.keyDown(cell('2'), { key: 'Tab' })
    expect(document.activeElement).toBe(cell('2'))
  })

  it('stages the focused day with Enter and with Space', () => {
    const onPick = vi.fn()
    const view = render(<Row value="2026-10-05" onPick={onPick} />)
    fireEvent.click(view.getByRole('button', { name: 'timing.date' }))
    const cell = (day: string): HTMLElement => within(view.getByRole('grid')).getByRole('gridcell', { name: day })

    fireEvent.keyDown(cell('8'), { key: 'Enter' })
    expect(onPick).toHaveBeenLastCalledWith('2026-10-08')
    fireEvent.keyDown(cell('9'), { key: ' ' })
    expect(onPick).toHaveBeenLastCalledWith('2026-10-09')
    expect(view.getByRole('button', { name: 'timing.date' }).textContent).toBe('2026/10/09')
  })

  it('closes on Escape and hands focus back to the trigger', () => {
    const view = render(<Row value="2026-10-05" />)
    const trigger = view.getByRole('button', { name: 'timing.date' })
    fireEvent.click(trigger)
    fireEvent.keyDown(within(view.getByRole('grid')).getByRole('gridcell', { name: '5' }), { key: 'Escape' })

    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.queryByRole('grid')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes when the pointer presses outside the trigger and the panel', () => {
    const view = render(<Row value="2026-10-05" />)
    fireEvent.click(view.getByRole('button', { name: 'timing.date' }))
    expect(view.getByRole('grid')).toBeDefined()

    fireEvent.pointerDown(document.body)
    expect(view.queryByRole('grid')).toBeNull()
    expect(view.queryByRole('dialog')).toBeNull()
  })

  it('keeps a read-only row shut', () => {
    const onPick = vi.fn()
    const view = render(<Row value="2026-10-05" disabled onPick={onPick} />)
    const trigger = view.getByRole('button', { name: 'timing.date' })
    expect(trigger).toHaveProperty('disabled', true)

    fireEvent.click(trigger)
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.queryByRole('grid')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('IconCalendarOutlineRegular', () => {
  it('renders the decorative calendar glyph the date trigger carries', () => {
    const view = render(<IconCalendarOutlineRegular className="pickerIcon" />)
    const glyph = view.container.querySelector('svg')
    expect(glyph?.getAttribute('aria-hidden')).toBe('true')
    expect(glyph?.getAttribute('viewBox')).toBe('0 0 14 14')
    expect(glyph?.getAttribute('stroke-width')).toBe('1')
    expect(glyph?.getAttribute('class')).toBe('pickerIcon')
    expect(glyph?.querySelectorAll('rect, path')).toHaveLength(3)
  })

  it('renders the glyph without a placement class', () => {
    const view = render(<IconCalendarOutlineRegular />)
    expect(view.container.querySelector('svg')?.getAttribute('class')).toBeNull()
  })
})
