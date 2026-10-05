// @vitest-environment jsdom
/** DeployTemplatePanel behavior: hidden without the port, search rendering,
 * the install flow through picking/progress/done, and failure copy. */
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach } from 'vitest'
import { DeployTemplatePanel, type DeployTemplatePort } from '../src/client/DeployTemplatePanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

/** A port stub with one marketplace row and a recording install. */
function port(overrides: Partial<DeployTemplatePort> = {}): DeployTemplatePort {
  return {
    search: vi.fn(async () => [
      { id: 'tpl-1', displayName: 'PC 管理台模板', templateKey: 'pc-admin', version: '0.2.0' },
    ]),
    install: vi.fn(async ({ reportProgress }) => {
      reportProgress?.({ kind: 'download', percent: 100 })
      reportProgress?.({ kind: 'write', file: 'src/main.ts', index: 1, total: 2 })
      return { fileCount: 2 }
    }),
    pickDirectory: vi.fn(async () => '/picked/dir'),
    ...overrides,
  }
}

describe('DeployTemplatePanel', () => {
  it('renders nothing without the port', () => {
    const { container } = render(<DeployTemplatePanel deploy={undefined} t={t} />)
    expect(container.innerHTML).toBe('')
  })

  it('searches and renders marketplace rows', async () => {
    const deploy = port()
    render(<DeployTemplatePanel deploy={deploy} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await vi.waitFor(() => expect(screen.getByText('PC 管理台模板')).toBeTruthy())
    expect(deploy.search).toHaveBeenCalledWith('')
  })

  it('runs an install through picking and progress to the done copy', async () => {
    const deploy = port()
    render(<DeployTemplatePanel deploy={deploy} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '安装' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    await vi.waitFor(() =>
      expect(screen.getByText('已安装 2 个文件到 /picked/dir 将该目录添加为工作区并新建会话，即可基于模板继续开发')).toBeTruthy())
    expect(deploy.install).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'tpl-1', targetDirectory: '/picked/dir' }),
    )
  })

  it('surfaces the no-directory copy when the picker yields nothing', async () => {
    const deploy = port({ pickDirectory: vi.fn(async () => undefined) })
    render(<DeployTemplatePanel deploy={deploy} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '安装' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    await vi.waitFor(() => expect(screen.getByText('未选择安装目录')).toBeTruthy())
  })

  it('surfaces install failures through the failure copy', async () => {
    const deploy = port({ install: vi.fn(async () => { throw new Error('target missing') }) })
    render(<DeployTemplatePanel deploy={deploy} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '安装' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '安装' }))
    await vi.waitFor(() => expect(screen.getByText('安装失败：target missing')).toBeTruthy())
  })
})
