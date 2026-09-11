// @vitest-environment jsdom
/** Excel number-format codes: sections, digit patterns, dates, and text. */
import { describe, expect, it } from 'vitest'
import {
  formatCellValue, formatGeneral, isDateFormat, serialToDateParts,
} from '../src/client/xlsx/number-format.ts'

describe('isDateFormat', () => {
  it('recognizes date and time codes and rejects numeric ones', () => {
    for (const code of ['yyyy-mm-dd', 'd/m/yy', 'h:mm:ss', 'm/d/yy h:mm', '[$-409]dddd', 'mm:ss']) {
      expect(isDateFormat(code)).toBe(true)
    }
    for (const code of ['General', '0.00', '#,##0', '0%', '"m"0', '@', '0.00E+00']) {
      expect(isDateFormat(code)).toBe(false)
    }
  })
})

describe('serialToDateParts', () => {
  it('places serials around Excel\u2019s phantom 1900 leap day', () => {
    expect(serialToDateParts(1, false)).toMatchObject({ year: 1900, month: 1, day: 1 })
    expect(serialToDateParts(59, false)).toMatchObject({ year: 1900, month: 2, day: 28 })
    // Excel counts a 1900-02-29 that never existed; the formatter reproduces it.
    expect(serialToDateParts(60, false)).toMatchObject({ year: 1900, month: 2, day: 29 })
    expect(serialToDateParts(61, false)).toMatchObject({ year: 1900, month: 3, day: 1 })
    expect(serialToDateParts(44197, false)).toMatchObject({ year: 2021, month: 1, day: 1 })
  })

  it('shifts the epoch for the 1904 date system', () => {
    expect(serialToDateParts(0, true)).toMatchObject({ year: 1904, month: 1, day: 1 })
    expect(serialToDateParts(1, true)).toMatchObject({ year: 1904, month: 1, day: 2 })
  })

  it('carries the time of day', () => {
    expect(serialToDateParts(44197.5, false)).toMatchObject({ hours: 12, minutes: 0, seconds: 0 })
  })
})

describe('formatGeneral', () => {
  it('drops trailing zeros and switches to scientific when the magnitude needs it', () => {
    expect(formatGeneral(0)).toBe('0')
    expect(formatGeneral(12)).toBe('12')
    expect(formatGeneral(1234.5678)).toBe('1234.5678')
    expect(formatGeneral(1e12)).toContain('E+')
    expect(formatGeneral(0.00000000001)).toContain('E-')
  })
})

describe('formatCellValue', () => {
  it('applies digit patterns, grouping, and scaling', () => {
    expect(formatCellValue(1234.5678, '0')).toBe('1235')
    expect(formatCellValue(1234.5678, '0.00')).toBe('1234.57')
    expect(formatCellValue(1234.5678, '#,##0.00')).toBe('1,234.57')
    expect(formatCellValue(1234.5678, '#,##0,')).toBe('1')
    expect(formatCellValue(0.5, '0%')).toBe('50%')
    expect(formatCellValue(0.5, '#.##')).toBe('.5')
    expect(formatCellValue(1.5, '0.##')).toBe('1.5')
    expect(formatCellValue(1.5, '0.00')).toBe('1.50')
  })

  it('renders currency and literal text around the number', () => {
    expect(formatCellValue(12.5, '"$"#,##0.00')).toBe('$12.50')
    expect(formatCellValue(12.5, '#,##0.00" 元"')).toBe('12.50 元')
    expect(formatCellValue(1234, '\\A0')).toBe('A1234')
  })

  it('picks the section a value belongs to', () => {
    expect(formatCellValue(5, '0"+"')).toBe('5+')
    expect(formatCellValue(-5, '0;[Red]-0')).toBe('-5')
    expect(formatCellValue(-5, '0;(0)')).toBe('(5)')
    expect(formatCellValue(0, '0;(0);"zero"')).toBe('zero')
    expect(formatCellValue('x', '0;0;0;"text:"@')).toBe('text:x')
  })

  it('formats numbers with the builtin date codes', () => {
    expect(formatCellValue(44197, 'yyyy-mm-dd')).toBe('2021-01-01')
    expect(formatCellValue(44197, 'm/d/yy')).toBe('1/1/21')
    expect(formatCellValue(44197, 'mmm d, yyyy')).toBe('Jan 1, 2021')
    expect(formatCellValue(44197, 'dddd')).toBe('Friday')
    expect(formatCellValue(44197.75, 'h:mm:ss')).toBe('18:00:00')
    expect(formatCellValue(44197.75, 'h:mm AM/PM')).toBe('6:00 PM')
    expect(formatCellValue(1.5, '[h]:mm:ss')).toBe('36:00:00')
  })

  it('renders booleans and leaves unformatted text alone', () => {
    expect(formatCellValue(true, 'General')).toBe('TRUE')
    expect(formatCellValue(false, 'General')).toBe('FALSE')
    expect(formatCellValue('hello', 'General')).toBe('hello')
  })
})
