import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifySdkworkDependencies } from './sdkwork-dependencies.ts'

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'dsh-sdkwork-dependencies-'))
  const root = join(parent, 'repo')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, '.github', 'actions', 'setup-sdkwork-siblings'), { recursive: true })
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  const repository = {
    name: 'sdkwork-example',
    url: 'https://github.com/sdkwork-ai/sdkwork-example.git',
    commit: '0123456789abcdef0123456789abcdef01234567',
  }
  writeFileSync(join(root, 'scripts', 'sdkwork-sources.manifest.json'), JSON.stringify({ version: 1, repositories: [repository] }))
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "../sdkwork-example/packages/example"\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), '../sdkwork-example/packages/example:\n')
  writeFileSync(join(root, 'package.json'), '{}\n')
  writeFileSync(join(root, 'tsconfig.json'), '{}\n')
  writeFileSync(join(root, 'tsconfig.client.json'), [
    '"packages/client/ui-knowledge/tests/**"',
    '"packages/client/ui-drive/tests/**"',
    '',
  ].join('\n'))
  writeFileSync(join(root, 'tsdown.config.ts'), "workspace: ['packages/*/*']\n")
  writeFileSync(join(root, '.github', 'actions', 'setup-sdkwork-siblings', 'action.yml'), [
    'sdkwork-sources.manifest.json',
    'https://github.com/sdkwork-ai/${repository.name}.git',
    'http.https://github.com/.extraheader',
    '::add-mask::',
    'status --porcelain --ignored',
    '',
  ].join('\n'))
  writeFileSync(join(root, '.github', 'workflows', 'build.yml'), 'uses: ./.github/actions/setup-sdkwork-siblings\n')
  for (const file of ['Dockerfile', 'Dockerfile.debug']) {
    writeFileSync(join(root, file), 'COPY --from=sdkwork-ecosystem sdkwork-example /sdkwork-example\n')
  }
  return { parent, repository, root }
}

describe('verifySdkworkDependencies', () => {
  it('accepts one manifest-driven sibling workspace', () => {
    const { root } = fixture()
    expect(verifySdkworkDependencies(root)).toEqual([])
  })

  it('rejects forbidden parent paths and unpinned siblings', () => {
    const { root } = fixture()
    writeFileSync(join(root, 'pnpm-workspace.yaml'), [
      'packages:',
      '  - "../birdcoder-pinned-parent/sdkwork-example/packages/example"',
      '  - "../sdkwork-extra/packages/example"',
      '',
    ].join('\n'))
    const errors = verifySdkworkDependencies(root)
    expect(errors).toContain('pnpm-workspace.yaml: external member "../birdcoder-pinned-parent/sdkwork-example/packages/example" must be under ../sdkwork-*')
    expect(errors).toContain('pnpm-workspace.yaml: sdkwork-extra has no entry in scripts/sdkwork-sources.manifest.json')
    expect(errors).toContain('pnpm-workspace.yaml: references forbidden external parent birdcoder-pinned-parent')
  })

  it('rejects checking SDKWork source tests in the Client aggregate', () => {
    const { root } = fixture()
    writeFileSync(join(root, 'tsconfig.client.json'), '{}\n')
    const errors = verifySdkworkDependencies(root)
    expect(errors).toContain(
      'tsconfig.client.json: must exclude packages/client/ui-knowledge/tests/** because tsconfig.tests.json owns its SDKWork source checks',
    )
    expect(errors).toContain(
      'tsconfig.client.json: must exclude packages/client/ui-drive/tests/** because tsconfig.tests.json owns its SDKWork source checks',
    )
  })

  it('rejects a workflow that skips SDKWork checkout without a token', () => {
    const { root } = fixture()
    writeFileSync(join(root, '.github', 'workflows', 'build.yml'), [
      '- if: ${{ env.SDKWORK_GITHUB_TOKEN != \'\' }}',
      '  uses: ./.github/actions/setup-sdkwork-siblings',
      '',
    ].join('\n'))
    expect(verifySdkworkDependencies(root)).toContain(
      '.github/workflows/build.yml: SDKWork checkout must fail when its token is missing, not skip',
    )
  })

  it('rejects exposing the SDKWork token to a complete workflow', () => {
    const { root } = fixture()
    writeFileSync(join(root, '.github', 'workflows', 'build.yml'), [
      'env:',
      '  SDKWORK_GITHUB_TOKEN: ${{ secrets.SDKWORK_GITHUB_TOKEN }}',
      'steps:',
      '  - uses: ./.github/actions/setup-sdkwork-siblings',
      '',
    ].join('\n'))
    expect(verifySdkworkDependencies(root)).toContain(
      '.github/workflows/build.yml: SDKWork token must be scoped to the checkout action input',
    )
  })

  it('rejects an online checkout with untracked input', () => {
    const { parent, repository, root } = fixture()
    const sibling = join(parent, repository.name)
    mkdirSync(sibling)
    execFileSync('git', ['-C', sibling, 'init', '-q'])
    execFileSync('git', ['-C', sibling, 'config', 'user.email', 'fixture@example.test'])
    execFileSync('git', ['-C', sibling, 'config', 'user.name', 'Fixture'])
    writeFileSync(join(sibling, 'README.md'), 'fixture\n')
    execFileSync('git', ['-C', sibling, 'add', 'README.md'])
    execFileSync('git', ['-C', sibling, 'commit', '-qm', 'fixture'])
    execFileSync('git', ['-C', sibling, 'remote', 'add', 'origin', repository.url])
    repository.commit = execFileSync('git', ['-C', sibling, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    writeFileSync(join(root, 'scripts', 'sdkwork-sources.manifest.json'), JSON.stringify({ version: 1, repositories: [repository] }))
    writeFileSync(join(sibling, 'generated.ts'), 'export {}\n')
    expect(verifySdkworkDependencies(root, { online: true })).toContain(
      'sdkwork-example: pinned checkout has uncommitted, untracked, or ignored files',
    )
  })

  it('rejects an online checkout at a different commit', () => {
    const { parent, repository, root } = fixture()
    const sibling = join(parent, repository.name)
    mkdirSync(sibling)
    execFileSync('git', ['-C', sibling, 'init', '-q'])
    execFileSync('git', ['-C', sibling, 'config', 'user.email', 'fixture@example.test'])
    execFileSync('git', ['-C', sibling, 'config', 'user.name', 'Fixture'])
    writeFileSync(join(sibling, 'README.md'), 'fixture\n')
    execFileSync('git', ['-C', sibling, 'add', 'README.md'])
    execFileSync('git', ['-C', sibling, 'commit', '-qm', 'fixture'])
    execFileSync('git', ['-C', sibling, 'remote', 'add', 'origin', repository.url])
    const errors = verifySdkworkDependencies(root, { online: true })
    expect(errors.some(error => error.includes('does not match pinned commit'))).toBe(true)
  })
})
