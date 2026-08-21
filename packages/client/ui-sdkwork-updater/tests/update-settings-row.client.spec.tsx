// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  CHANNEL_LABELS,
  UpdateSettingsRow,
  updateStatusText,
  type UpdateSettingsRowProps,
} from '../src/client/UpdateSettingsRow.tsx'
import type { UpdateSettingsRowState } from '../src/client/update-settings-store.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const READY: UpdateSettingsRowState = {
  autoCheckUpdates: true,
  updateChannel: 'follow',
  autoDownload: false,
  writable: true,
  revision: 1,
  phase: 'idle',
  canInstall: true,
  version: undefined,
  error: undefined,
}

/** A fake store instance served through the useStore prop. */
function rowProps(
  state: UpdateSettingsRowState,
  over: Partial<{
    setAutoCheck: Mock<(value: boolean) => void>
    setChannel: Mock<(value: 'follow' | 'stable' | 'rc') => void>
    setAutoDownload: Mock<(value: boolean) => void>
    check: Mock<() => void>
  }> = {},
): {
  props: UpdateSettingsRowProps
  setAutoCheck: Mock<(value: boolean) => void>
  setChannel: Mock<(value: 'follow' | 'stable' | 'rc') => void>
  setAutoDownload: Mock<(value: boolean) => void>
  check: Mock<() => void>
} {
  const setAutoCheck = over.setAutoCheck ?? vi.fn()
  const setChannel = over.setChannel ?? vi.fn()
  const setAutoDownload = over.setAutoDownload ?? vi.fn()
  const check = over.check ?? vi.fn()
  const props = {
    useStore: <T,>(select: (snapshot: UpdateSettingsRowState) => T): T => select(state),
    setAutoCheck,
    setChannel,
    setAutoDownload,
    check,
  } as unknown as UpdateSettingsRowProps
  return { props, setAutoCheck, setChannel, setAutoDownload, check }
}

describe('updateStatusText', () => {
  it('maps the phases to status labels', () => {
    expect(updateStatusText({ phase: 'checking' })).toBe('正在检查更新…')
    expect(updateStatusText({ phase: 'available', version: '0.1.0-rc.10' })).toBe('发现新版本 v0.1.0-rc.10')
    expect(updateStatusText({ phase: 'downloading', version: '0.1.0-rc.10' })).toBe('发现新版本 v0.1.0-rc.10')
    expect(updateStatusText({ phase: 'downloaded', version: '0.1.0-rc.10' })).toBe('发现新版本 v0.1.0-rc.10')
  })

  it('distinguishes check and download failures, and stays quiet otherwise', () => {
    expect(updateStatusText({ phase: 'idle', error: 'network down' })).toBe('检查更新失败：network down')
    expect(updateStatusText({ phase: 'available', version: '0.1.0-rc.10', error: 'signature mismatch' }))
      .toBe('下载失败：signature mismatch')
    expect(updateStatusText({ phase: 'idle' })).toBeUndefined()
    expect(updateStatusText({ phase: 'disabled' })).toBeUndefined()
    expect(updateStatusText({ phase: 'installing' })).toBeUndefined()
  })
})

describe('UpdateSettingsRow', () => {
  it('renders nothing before the scope accepts a section', () => {
    const { props } = rowProps({ ...READY, autoCheckUpdates: undefined, updateChannel: undefined, autoDownload: undefined })
    const { container } = render(<UpdateSettingsRow {...props} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders the switches, the channel select, and the manual check', () => {
    const { props } = rowProps(READY)
    render(<UpdateSettingsRow {...props} />)
    expect(screen.getByText('自动更新')).toBeDefined()
    expect(screen.getByRole('switch', { name: '自动检查更新' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('switch', { name: '自动下载' }).getAttribute('aria-checked')).toBe('false')
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('follow')
    expect(screen.getByRole('option', { name: CHANNEL_LABELS.rc })).toBeDefined()
    expect(screen.getByRole('button', { name: '检查更新' })).toBeDefined()
  })

  it('renders the switches in their off state', () => {
    const { props } = rowProps({ ...READY, autoCheckUpdates: false, autoDownload: true })
    render(<UpdateSettingsRow {...props} />)
    expect(screen.getByRole('switch', { name: '自动检查更新' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: '自动下载' }).getAttribute('aria-checked')).toBe('true')
  })

  it('routes the switch, select, and check actions to the injected face', () => {
    const { props, setAutoCheck, setChannel, setAutoDownload, check } = rowProps(READY)
    render(<UpdateSettingsRow {...props} />)
    screen.getByRole('switch', { name: '自动检查更新' }).click()
    expect(setAutoCheck).toHaveBeenCalledWith(false)
    screen.getByRole('switch', { name: '自动下载' }).click()
    expect(setAutoDownload).toHaveBeenCalledWith(true)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    select.value = 'rc'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    expect(setChannel).toHaveBeenCalledWith('rc')
    screen.getByRole('button', { name: '检查更新' }).click()
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('disables the controls on a read-only document', () => {
    const { props } = rowProps({ ...READY, writable: false })
    render(<UpdateSettingsRow {...props} />)
    expect(screen.getByRole<HTMLButtonElement>('switch', { name: '自动检查更新' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLSelectElement>('combobox').disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '检查更新' }).disabled).toBe(false)
  })

  it('keeps discovery controls available when installer handoff is unavailable', () => {
    const { props, setAutoCheck, setAutoDownload, check } = rowProps({ ...READY, canInstall: false })
    render(<UpdateSettingsRow {...props} />)
    const autoCheck = screen.getByRole<HTMLButtonElement>('switch', { name: '自动检查更新' })
    const autoDownload = screen.getByRole<HTMLButtonElement>('switch', { name: '自动下载' })
    const manualCheck = screen.getByRole<HTMLButtonElement>('button', { name: '检查更新' })
    expect(autoCheck.disabled).toBe(false)
    expect(autoDownload.disabled).toBe(true)
    expect(manualCheck.disabled).toBe(false)
    autoCheck.click()
    autoDownload.click()
    manualCheck.click()
    expect(setAutoCheck).toHaveBeenCalledWith(false)
    expect(setAutoDownload).not.toHaveBeenCalled()
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('shows the bridge-fed status line', () => {
    const { props } = rowProps({ ...READY, phase: 'checking' })
    render(<UpdateSettingsRow {...props} />)
    expect(screen.getByText('正在检查更新…')).toBeDefined()
  })
})
