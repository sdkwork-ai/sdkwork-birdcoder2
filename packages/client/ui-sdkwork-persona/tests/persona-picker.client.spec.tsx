// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PersonaDialog, type PersonaDialogProps } from '../src/client/PersonaDialog.tsx'
import { zh } from '../src/client/locales.ts'
import { DEFAULT_PERSONA_SETTINGS, PERSONA_ROLE_IDS, type PersonaSettings } from '../src/persona-settings.ts'
import { PERSONA_INTEREST_IDS } from '../src/client/catalog.ts'

afterEach(cleanup)

/** Shipped Chinese copy — the component spec asserts user-visible copy, with the
 * locale runtime's `{name}` interpolation mirrored so counted copy is verifiable. */
const t = (key: string, params?: Record<string, unknown>): string => {
  const template = (zh as Record<string, string>)[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    name in params ? String(params[name]) : match
  ))
}

function picker(options: {
  open?: boolean
  choices?: Partial<PersonaSettings>
  writable?: boolean
  accepted?: boolean
  failure?: Error
  roleIds?: readonly (typeof PERSONA_ROLE_IDS)[number][]
  interestIds?: readonly (typeof PERSONA_INTEREST_IDS)[number][]
} = {}) {
  const onClose = vi.fn()
  const save = vi.fn(async () => {
    if (options.failure !== undefined) throw options.failure
    return options.accepted ?? true
  })
  const choices: PersonaSettings = { ...DEFAULT_PERSONA_SETTINGS, ...options.choices }
  const catalog = {
    roleIds: options.roleIds ?? PERSONA_ROLE_IDS,
    interestIds: options.interestIds ?? PERSONA_INTEREST_IDS,
  }
  const props = {
    onClose,
    save,
    useStore: vi.fn((sel: (state: { dialogOpen: boolean }) => boolean) => sel({ dialogOpen: options.open ?? true })),
    useChoices: vi.fn((sel: (value: PersonaSettings) => PersonaSettings) => sel(choices)),
    useWritable: vi.fn((sel: (value: boolean) => boolean) => sel(options.writable ?? true)),
    useCatalog: vi.fn((sel: (value: typeof catalog) => typeof catalog) => sel(catalog)),
    t,
  } as never as PersonaDialogProps
  render(<PersonaDialog {...props} />)
  return { onClose, save }
}

describe('PersonaDialog', () => {
  it('renders nothing while closed (the overlay layer stays click-through)', () => {
    picker({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders every role and interest with the stored choice preselected', () => {
    picker({ choices: { role: 'teacher', interests: ['postgraduate', 'development'] } })
    const dialog = screen.getByRole('dialog')
    const roles = within(dialog).getByRole('group', { name: '你的角色' })
    expect(within(roles).getAllByRole('radio')).toHaveLength(8)
    const teacher = within(roles).getByRole('radio', { name: /^老师/ })
    expect((teacher as HTMLInputElement).checked).toBe(true)
    expect((within(roles).getByRole('radio', { name: /^学员/ }) as HTMLInputElement).checked).toBe(false)
    // The chosen card carries the corner check glyph; the others do not.
    expect(teacher.closest('label')?.querySelector('svg')).not.toBeNull()
    expect(within(roles).getByRole('radio', { name: /^学员/ }).closest('label')?.querySelector('svg')).toBeNull()
    const interests = within(dialog).getByRole('group', { name: /^关注方向/ })
    expect(within(interests).getAllByRole('checkbox')).toHaveLength(12)
    expect((within(interests).getByRole('checkbox', { name: '考研' }) as HTMLInputElement).checked).toBe(true)
    expect((within(interests).getByRole('checkbox', { name: '编程开发' }) as HTMLInputElement).checked).toBe(true)
    expect((within(interests).getByRole('checkbox', { name: '保研' }) as HTMLInputElement).checked).toBe(false)
    // The legend counts the chosen directions with the shipped copy.
    expect(within(dialog).getByText('已选 2 项')).not.toBeNull()
  })

  it('renders only the ids the account catalog allows and drops the rest from the draft', () => {
    picker({
      roleIds: ['learner', 'teacher'],
      interestIds: ['postgraduate', 'k12'],
      choices: { interests: ['postgraduate', 'k12', 'employment'] },
    })
    const dialog = screen.getByRole('dialog')
    const roles = within(dialog).getByRole('group', { name: '你的角色' })
    expect(within(roles).getAllByRole('radio')).toHaveLength(2)
    const interests = within(dialog).getByRole('group', { name: /^关注方向/ })
    expect(within(interests).getAllByRole('checkbox')).toHaveLength(2)
    // A stored direction the catalog no longer allows is neither rendered nor counted.
    expect((within(interests).getByRole('checkbox', { name: '考研' }) as HTMLInputElement).checked).toBe(true)
    expect(within(dialog).getByText('已选 2 项')).not.toBeNull()
  })

  it('counts the chosen interest directions as they change', () => {
    picker()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/^已选 /)).toBeNull()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '就业求职' }))
    expect(within(dialog).getByText('已选 1 项')).not.toBeNull()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '公考编制' }))
    expect(within(dialog).getByText('已选 2 项')).not.toBeNull()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '就业求职' }))
    expect(within(dialog).getByText('已选 1 项')).not.toBeNull()
  })

  it('switches the role and toggles interest directions in the draft', () => {
    picker()
    const dialog = screen.getByRole('dialog')
    const roles = within(dialog).getByRole('group', { name: '你的角色' })
    fireEvent.click(within(roles).getByRole('radio', { name: /^合作伙伴/ }))
    expect((within(roles).getByRole('radio', { name: /^合作伙伴/ }) as HTMLInputElement).checked).toBe(true)
    const interests = within(dialog).getByRole('group', { name: /^关注方向/ })
    fireEvent.click(within(interests).getByRole('checkbox', { name: '就业求职' }))
    expect((within(interests).getByRole('checkbox', { name: '就业求职' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(interests).getByRole('checkbox', { name: '就业求职' }))
    expect((within(interests).getByRole('checkbox', { name: '就业求职' }) as HTMLInputElement).checked).toBe(false)
  })

  it('blocks saving without a role and keeps the dialog open', () => {
    const { save, onClose } = picker()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByRole('alert').textContent).toContain('请先选择一个角色')
    expect(save).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('saves the chosen role with its interest directions and closes', async () => {
    const { save, onClose } = picker()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /^学员/ }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '考研' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '保研' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledWith('learner', ['postgraduate', 'recommendation'])
    })
    await vi.waitFor(() => { expect(onClose).toHaveBeenCalledTimes(1) })
  })

  it('reports a refused write and keeps the draft', async () => {
    const { save, onClose } = picker({ accepted: false })
    fireEvent.click(screen.getByRole('radio', { name: /^员工/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('保存失败，请稍后重试')
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect((screen.getByRole('radio', { name: /^员工/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('reports a transport failure instead of escaping an unhandled rejection', async () => {
    const { onClose } = picker({ failure: new Error('offline') })
    fireEvent.click(screen.getByRole('radio', { name: /^开发者/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await vi.waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('保存失败，请稍后重试')
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('disables saving while the Host document is read-only and explains why', () => {
    picker({ writable: false })
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('当前设置不可写，暂时无法保存选择。')
  })

  it('offers a writable document no read-only notice', () => {
    picker()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('dismisses through the later action', () => {
    const { onClose, save } = picker()
    fireEvent.click(screen.getByRole('button', { name: '稍后设置' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(save).not.toHaveBeenCalled()
  })

  it('dismisses through Escape', () => {
    const { onClose } = picker()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
