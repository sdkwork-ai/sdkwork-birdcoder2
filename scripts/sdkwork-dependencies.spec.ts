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
    '"packages/client/ui-sdkwork-knowledge/tests/**"',
    '"packages/client/ui-sdkwork-drive/tests/**"',
    '"packages/client/ui-sdkwork-course/tests/**"',
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

/** A fixture import line built so the dependency-closure scanner never matches it in this file. */
function fixtureImport(specifier: string): string {
  return 'import ' + JSON.stringify(specifier) + '\n'
}

/** fixture with a real sibling member package and a tsconfig.base.json paths table. */
function closureFixture() {
  const { parent, repository, root } = fixture()
  const sibling = join(parent, repository.name)
  mkdirSync(join(sibling, 'packages', 'example', 'src'), { recursive: true })
  writeFileSync(join(sibling, 'packages', 'example', 'package.json'), JSON.stringify({ name: '@sdkwork/example' }))
  // Concatenated so the dependency-closure scanner (which matches literal
  // import lines inside source files) does not read the fixture as a real import.
  writeFileSync(join(sibling, 'packages', 'example', 'src', 'index.ts'), fixtureImport('@sdkwork/example') + 'export {}\n')
  writeFileSync(join(root, 'tsconfig.base.json'), JSON.stringify({
    compilerOptions: {
      paths: { '@sdkwork/example': ['../sdkwork-example/packages/example/src/index.ts'] },
    },
  }))
  return { root, sibling }
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
      'tsconfig.client.json: must exclude packages/client/ui-sdkwork-knowledge/tests/** because tsconfig.tests.json owns its SDKWork source checks',
    )
    expect(errors).toContain(
      'tsconfig.client.json: must exclude packages/client/ui-sdkwork-drive/tests/** because tsconfig.tests.json owns its SDKWork source checks',
    )
    expect(errors).toContain(
      'tsconfig.client.json: must exclude packages/client/ui-sdkwork-course/tests/** because tsconfig.tests.json owns its SDKWork source checks',
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

  it('rejects SDKWork packages left external in client bundles', () => {
    const { root } = fixture()
    mkdirSync(join(root, 'packages', 'client', 'ui-example', 'lib'), { recursive: true })
    writeFileSync(
      join(root, 'packages', 'client', 'ui-example', 'lib', 'client.js'),
      'require("@sdkwork/utils")\n',
    )
    expect(verifySdkworkDependencies(root)).toContain(
      'packages/client/ui-example/lib/client.js: client bundle leaves require("@sdkwork/utils") external — map the package to sibling source in tsconfig.bundle.json so tsdown inlines it',
    )
  })

  it('rejects a workspace member importing an unmapped @sdkwork package', () => {
    const { root, sibling } = closureFixture()
    writeFileSync(
      join(sibling, 'packages', 'example', 'src', 'index.ts'),
      fixtureImport('@sdkwork/example') + fixtureImport('@sdkwork/nowhere') + 'export {}\n',
    )
    const errors = verifySdkworkDependencies(root)
    expect(errors).toContain(
      '@sdkwork/nowhere: imported by the dependency closure but tsconfig.base.json maps no @sdkwork package root for it'
      + ' — add the mapping (or join the package as a workspace member) so client bundles inline sibling source on the release runner',
    )
  })

  it('rejects an @sdkwork path declaration nothing in the closure imports', () => {
    const { root } = closureFixture()
    const basePath = join(root, 'tsconfig.base.json')
    writeFileSync(basePath, JSON.stringify({
      compilerOptions: {
        paths: {
          '@sdkwork/example': ['../sdkwork-example/packages/example/src/index.ts'],
          '@sdkwork/ghost': ['../sdkwork-example/packages/example/src/ghost.ts'],
        },
      },
    }))
    expect(verifySdkworkDependencies(root)).toContain(
      'tsconfig.base.json: @sdkwork path @sdkwork/ghost covers no import in the dependency closure — remove it'
      + ' (regenerate with `node scripts/analyze-sdkwork-closure.mjs --rewrite`)',
    )
  })

  it('rejects duplicate @sdkwork path keys', () => {
    const { root } = closureFixture()
    const basePath = join(root, 'tsconfig.base.json')
    writeFileSync(basePath, [
      '{',
      '  "compilerOptions": {',
      '    "paths": {',
      '      "@sdkwork/example": ["../sdkwork-example/packages/example/src/index.ts"],',
      '      "@sdkwork/example": ["../sdkwork-example/packages/example/src/other.ts"],',
      '      "@sdkwork/ghost": ["../sdkwork-example/packages/example/src/ghost.ts"]',
      '    }',
      '  }',
      '}',
      '',
    ].join('\n'))
    const errors = verifySdkworkDependencies(root)
    expect(errors).toContain('tsconfig.base.json: duplicate @sdkwork path key @sdkwork/example')
    expect(errors.some(error => error.includes('@sdkwork/ghost covers no import'))).toBe(true)
  })

  it('rejects a local source importing an unmapped @sdkwork package', () => {
    const { root } = closureFixture()
    mkdirSync(join(root, 'packages', 'client', 'ui-example', 'src'), { recursive: true })
    writeFileSync(
      join(root, 'packages', 'client', 'ui-example', 'src', 'index.ts'),
      fixtureImport('@sdkwork/unmapped-local'),
    )
    expect(verifySdkworkDependencies(root)).toContain(
      '@sdkwork/unmapped-local: imported by the dependency closure but tsconfig.base.json maps no @sdkwork package root for it'
      + ' — add the mapping (or join the package as a workspace member) so client bundles inline sibling source on the release runner',
    )
  })
})
