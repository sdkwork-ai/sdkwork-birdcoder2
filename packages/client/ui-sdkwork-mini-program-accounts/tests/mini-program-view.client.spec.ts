// @vitest-environment jsdom
/** Mini-program form validation and display helpers. */
import { describe, expect, it } from 'vitest'
import {
  errorText, formatTimestamp, validateMiniProgramDraft, validateMiniProgramEdit,
} from '../src/client/miniProgramView.ts'

describe('miniProgramView', () => {
  it('validates the create form field by field', () => {
    expect(validateMiniProgramDraft({ appId: '', appSecret: 's', displayName: 'n' }))
      .toEqual({ ok: false, problem: 'appIdRequired' })
    expect(validateMiniProgramDraft({ appId: 'wx1', appSecret: ' ', displayName: 'n' }))
      .toEqual({ ok: false, problem: 'appSecretRequired' })
    expect(validateMiniProgramDraft({ appId: 'wx1', appSecret: 's', displayName: ' ' }))
      .toEqual({ ok: false, problem: 'displayNameRequired' })
    expect(validateMiniProgramDraft({ appId: ' wx1 ', appSecret: ' s ', displayName: ' n ' })).toEqual({ ok: true })
  })

  it('requires a display name when editing and leaves credentials optional', () => {
    expect(validateMiniProgramEdit({ displayName: ' ' })).toEqual({ ok: false, problem: 'displayNameRequired' })
    expect(validateMiniProgramEdit({ displayName: 'Name' })).toEqual({ ok: true })
  })

  it('reads failure text from Errors, strings, and nothing else', () => {
    expect(errorText(new Error('  wire failure  '))).toBe('wire failure')
    expect(errorText('plain')).toBe('plain')
    expect(errorText({ code: 1 })).toBe('')
    expect(errorText(undefined)).toBe('')
  })

  it('formats valid timestamps in UTC minutes and hides invalid ones', () => {
    expect(formatTimestamp('2026-01-02T03:04:05.000Z')).toBe('2026-01-02 03:04')
    expect(formatTimestamp('')).toBe('')
    expect(formatTimestamp(undefined)).toBe('')
    expect(formatTimestamp('not-a-date')).toBe('')
  })
})
