import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const runnerPrivatePnpmDestination = '${{ runner.temp }}/setup-pnpm'

describe('CI workflow', () => {
  it('isolates every pnpm action setup destination per runner', () => {
    const workflow: unknown = yaml.load(readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'))
    if (!isRecord(workflow) || !isRecord(workflow.jobs)) throw new TypeError('CI workflow must define jobs')

    const setups = Object.entries(workflow.jobs).flatMap(([jobName, job]) => {
      if (!isRecord(job) || !Array.isArray(job.steps)) return []
      return job.steps.flatMap((step) => {
        if (!isRecord(step) || typeof step.uses !== 'string' || !step.uses.startsWith('pnpm/action-setup@')) return []
        return [{ jobName, step }]
      })
    })

    expect(setups.length).toBeGreaterThan(0)
    for (const { jobName, step } of setups) {
      expect(step, `${jobName} must not share pnpm/action-setup's default destination`).toMatchObject({
        with: { dest: runnerPrivatePnpmDestination },
      })
    }
  })

  it('keeps a required Wine Windows job, a non-blocking native Windows job with failover, and a main-only standby', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    if (!isRecord(workflow.jobs)
      || !isRecord(workflow.jobs.windows)
      || !isRecord(workflow.jobs['windows-native'])
      || !isRecord(workflow.jobs['wine-apt-cache'])
      || !isRecord(workflow.jobs['serial-windows'])
      || !isRecord(workflow.jobs['node-24'])
      || !isRecord(workflow.jobs['node-24-coverage'])
      || !isRecord(workflow.jobs['node-24-consumers'])
      || !isRecord(workflow.jobs['all-checks-passed'])) {
      throw new TypeError('CI workflow must define windows, windows-native, wine-apt-cache, serial-windows, node-24, node-24-coverage, node-24-consumers, and all-checks-passed jobs')
    }

    const windows = workflow.jobs.windows
    const windowsNative = workflow.jobs['windows-native']
    const wineAptCache = workflow.jobs['wine-apt-cache']
    const serialWindows = workflow.jobs['serial-windows']
    const node24 = workflow.jobs['node-24']
    const node24Coverage = workflow.jobs['node-24-coverage']
    const node24Consumers = workflow.jobs['node-24-consumers']
    const aggregate = workflow.jobs['all-checks-passed']
    if (!Array.isArray(windows.steps) || !Array.isArray(aggregate.needs)) {
      throw new TypeError('Windows job must define steps and the aggregate must define needs')
    }
    const commandSteps = windows.steps.filter((step): step is Record<string, unknown> & { run: string } => (
      isRecord(step) && typeof step.run === 'string'
    ))

    // Required PR job: Wine on ubuntu-latest, runs wine-windows-gates.sh.
    expect(windows['runs-on']).toBe('ubuntu-latest')
    expect(windows.name).toBe('windows node 24 / wine blocking')
    expect(windows.if).toBe("github.event_name == 'pull_request'")
    expect(commandSteps.some(step => step.run.includes('wine-windows-gates.sh'))).toBe(true)

    // windows-native: non-blocking native job with failover, runs windows-complete.
    // Its pool is resolved by the Windows-specific switch.
    expect(typeof windowsNative['runs-on']).toBe('string')
    expect(windowsNative['runs-on']).toContain('DSH_CI_FAILOVER_WINDOWS')
    expect(windowsNative['runs-on']).not.toContain('DSH_CI_FAILOVER_LINUX')
    expect(windowsNative['runs-on']).toContain('self-hosted')
    expect(windowsNative['runs-on']).toContain('dsh-win-ci')
    expect(windowsNative['runs-on']).toContain('dsh-windows-2025-16core')
    expect(windowsNative.name).toBe('windows node 24 / native complete')
    expect(windowsNative.if).toBe("github.event_name == 'pull_request'")
    const nativeCommandSteps = (windowsNative.steps as unknown[]).filter((step): step is Record<string, unknown> & { run: string } => (
      isRecord(step) && typeof step.run === 'string'
    ))
    expect(nativeCommandSteps.map(step => step.run)).toContain('pnpm run check:ci:windows-complete')

    // wine-apt-cache: main-only, seeds the Wine apt cache.
    expect(wineAptCache.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    expect(wineAptCache['runs-on']).toBe('ubuntu-latest')

    // serial-windows: main-only standby, self-hosted, non-blocking.
    expect(serialWindows.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    expect(serialWindows['runs-on']).toEqual(['self-hosted', 'dsh-win-ci', 'windows'])
    expect(serialWindows.name).toBe('serial / windows (self-hosted standby)')

    // Aggregate: Wine `windows` required, native `windows-native` excluded.
    expect(aggregate.needs).toContain('windows')
    expect(aggregate.needs).not.toContain('windows-native')
    expect(aggregate.needs).not.toContain('serial-windows')

    // Linux failover is a separate switch: the three required Linux workers
    // and the verdict job resolve their pool through DSH_CI_FAILOVER_LINUX,
    // never the Windows switch.
    for (const [jobName, job] of [['node-24', node24], ['node-24-coverage', node24Coverage], ['node-24-consumers', node24Consumers]] as const) {
      expect(typeof job['runs-on']).toBe('string')
      expect(job['runs-on'], `${jobName} runs-on must use the Linux failover switch`).toContain('DSH_CI_FAILOVER_LINUX')
      expect(job['runs-on'], `${jobName} runs-on must not use the Windows failover switch`).not.toContain('DSH_CI_FAILOVER_WINDOWS')
      expect(job['runs-on']).toContain('vm-backup')
    }
    expect(aggregate['runs-on']).toContain('DSH_CI_FAILOVER_LINUX')
    expect(aggregate['runs-on']).not.toContain('DSH_CI_FAILOVER_WINDOWS')
    expect(aggregate['runs-on']).toContain('vm-backup')
  })

  it('exempts push from cancellation, so one main merge does not cancel the running drill', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    if (!isRecord(workflow.jobs) || !isRecord(workflow.concurrency)) {
      throw new TypeError('CI workflow must define jobs and a workflow-level concurrency block')
    }

    // Cancellation applies to the whole superseded RUN, so this has to be
    // decided at workflow level and gated on the event: a job-level group
    // cannot exempt its job from its run being cancelled. Only push is exempt —
    // a drill takes longer than the interval between main merges. The negated
    // form is load-bearing: `== 'pull_request'` would also stop cancelling
    // workflow_dispatch, and a re-dispatched runner benchmark holds up to 12
    // larger runners for 15 minutes in this same group on main. The
    // expression is evaluated against the NEWLY TRIGGERED run, so a dispatch on
    // main still cancels a mid-flight drill; the runbook records that bound.
    expect(workflow.concurrency['cancel-in-progress']).toBe("${{ github.event_name != 'push' }}")

    // Neither drill may carry a job-level group: it would not exempt the job
    // from run-scoped cancellation.
    for (const name of ['serial-linux-selfhosted', 'serial-windows']) {
      const job = workflow.jobs[name]
      if (!isRecord(job)) throw new TypeError(`${name} must be defined`)
      expect(job.concurrency).toBeUndefined()
      // Both stay main-push-only; that is what makes the push carve-out safe.
      expect(job.if).toBe("github.event_name == 'push' && github.ref == 'refs/heads/main'")
    }

    // What bounds the cost of exempting push: a main push may only carry the
    // cache seeder and the two drills. Any job reachable on push would start
    // accumulating uncancelled runs, so the set is pinned here.
    //
    // Classification is an exact allowlist of the conditions in use, not a
    // substring match: `github.event_name != 'pull_request'` mentions
    // `pull_request` yet IS push-reachable, so matching on the event name alone
    // would silently misclassify it as gated.
    const NOT_PUSH_REACHABLE = new Set([
      "github.event_name == 'pull_request'",
      "always() && github.event_name == 'pull_request'",
      "github.event_name == 'workflow_dispatch' && inputs.suite == 'larger-runner-benchmark'",
      "github.event_name == 'workflow_dispatch' && inputs.suite == 'consolidated-runner-benchmark'",
    ])
    const pushReachable = Object.entries(workflow.jobs)
      .filter(([, job]) => {
        if (!isRecord(job)) return false
        if (job.if === undefined) return true // unconditional: runs on every event
        if (job.if === false) return false // `if: false` parses as a boolean
        if (typeof job.if !== 'string') return true // unrecognized shape: surface it
        return !NOT_PUSH_REACHABLE.has(job.if.trim())
      })
      .map(([name]) => name)
      .sort()
    expect(pushReachable).toEqual(['serial-linux-selfhosted', 'serial-windows', 'wine-apt-cache'])

    // Why workflow_dispatch must keep cancelling: each benchmark fans out to a
    // dozen larger runners at once, in this same group on main. If it stopped
    // cancelling, a re-dispatch would queue ahead of a drill instead of
    // replacing the stale measurement.
    for (const name of ['larger-runner-benchmark', 'consolidated-runner-benchmark']) {
      const job = workflow.jobs[name]
      if (!isRecord(job) || !isRecord(job.strategy)) {
        throw new TypeError(`${name} must define a matrix strategy`)
      }
      expect(job.strategy['max-parallel']).toBe(12)
      expect(job['timeout-minutes']).toBe(15)
    }
  })

  it('keeps supported LSP source under native Windows coverage', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8')

    expect(config).not.toContain('packages/lsp/lsp-stdio/src/connection.ts')
    expect(config).not.toContain('packages/lsp/lsp-stdio/src/index.ts')
    expect(config).not.toContain('packages/lsp/lsp-stdio/src/instance.ts')
  })

  it('requires one release-shaped Python runtime target on every pull request', () => {
    const workflow = loadWorkflow('.github/workflows/ci.yml')
    const pythonRuntime = workflowJob(workflow, 'python-runtime')
    const aggregate = workflowJob(workflow, 'all-checks-passed')
    if (!Array.isArray(aggregate.needs)) {
      throw new TypeError('CI aggregate must define required job dependencies')
    }

    expect(pythonRuntime).toMatchObject({
      if: "github.event_name == 'pull_request'",
      name: 'python runtime / release-shaped Linux x64',
      uses: './.github/workflows/build-exe-for-python-sdk.yml',
      with: {
        targets: 'node24-linux-x64',
        ci: true,
      },
    })
    expect(aggregate.needs).toContain('python-runtime')
  })

  it('keeps every Vitest project process-isolated on native Windows', () => {
    const config = readFileSync(resolve(root, 'vitest.config.ts'), 'utf8')

    expect(config).not.toContain("pool: process.platform === 'win32' ? 'threads' : 'forks'")
    expect(config.match(/pool: 'forks'/g)).toHaveLength(2)
  })
})

describe('E2B e2e workflow', () => {
  it('is manual-only and fails loud before running the focused live suite', () => {
    const workflow = loadWorkflow('.github/workflows/e2b-e2e.yml')
    expect(workflow.on).toEqual({ workflow_dispatch: null })
    if (!isRecord(workflow.jobs) || !isRecord(workflow.jobs.e2b) || !Array.isArray(workflow.jobs.e2b.steps)) {
      throw new TypeError('E2B e2e workflow must define the e2b job steps')
    }

    const steps = workflow.jobs.e2b.steps.filter(isRecord)
    const preflight = steps.find(step => step.name === 'Preflight (require E2B API key)')
    const e2b = steps.find(step => step.name === 'E2B tests (live sandbox)')

    expect(preflight).toMatchObject({
      env: { E2B_API_KEY: '${{ secrets.E2B_API_KEY_EXTERNAL }}' },
    })
    expect(preflight?.run).toContain('E2B_API_KEY_EXTERNAL repository secret')
    expect(e2b).toMatchObject({
      env: {
        E2B_API_KEY: '${{ secrets.E2B_API_KEY_EXTERNAL }}',
        DSH_E2E_MAX_WORKERS: '1',
        DSH_EXAMPLE_MODE: 'lib',
      },
    })
    expect(e2b?.run).toContain('packages/e2b/e2b/tests/composition.e2e.ts')
  })
})

describe('Desktop release workflow', () => {
  it('covers native OS and CPU targets as a reusable or manual-only package matrix', () => {
    const workflow = loadWorkflow('.github/workflows/desktop-release.yml')
    const packageJob = workflowJob(workflow, 'package')
    const workflowCall = workflowEvent(workflow, 'workflow_call')
    const workflowDispatch = workflowEvent(workflow, 'workflow_dispatch')
    if (!isRecord(packageJob.strategy)
      || !isRecord(packageJob.strategy.matrix)
      || !Array.isArray(packageJob.strategy.matrix.include)
      || !Array.isArray(packageJob.steps)) {
      throw new TypeError('desktop release package job must define matrix entries and steps')
    }
    expect(workflowCall).toMatchObject({ inputs: { version: { required: true, type: 'string' } } })
    expect(workflowDispatch).toMatchObject({ inputs: { version: { required: false, type: 'string' } } })
    expect(workflow.on).not.toHaveProperty('push')
    expect(workflow.jobs).not.toHaveProperty('release')
    expect(packageJob['timeout-minutes']).toBe(60)

    const entries = packageJob.strategy.matrix.include
    expect(entries.map((entry) => {
      if (!isRecord(entry)) throw new TypeError('desktop release matrix entries must be records')
      return [entry.name, entry['builder-args']]
    })).toEqual([
      ['windows-x64', '--win --x64'],
      ['windows-arm64', '--win --arm64'],
      ['macos-x64', '--mac --x64'],
      ['macos-arm64', '--mac --arm64'],
      ['linux-x64', '--linux --x64'],
      ['linux-arm64', '--linux --arm64'],
    ])
    expect(entries.map((entry) => {
      if (!isRecord(entry)) throw new TypeError('desktop release matrix entries must be records')
      return [entry.name, entry.os]
    })).toEqual([
      ['windows-x64', 'windows-2025'],
      ['windows-arm64', 'windows-11-arm'],
      ['macos-x64', 'macos-15-intel'],
      ['macos-arm64', 'macos-15'],
      ['linux-x64', 'ubuntu-24.04'],
      ['linux-arm64', 'ubuntu-24.04-arm'],
    ])

    const pack = packageJob.steps.filter(isRecord).find(step => step.name === 'Pack installers and update metadata')
    expect(pack?.run).toContain('${{ matrix.builder-args }}')
    expect(pack?.run).toContain('--publish never')
    expect(entries.filter(entry => isRecord(entry) && String(entry.name).startsWith('macos-')).map((entry) => {
      if (!isRecord(entry)) throw new TypeError('desktop release matrix entries must be records')
      return entry['app-dir']
    })).toEqual([
      'release/mac/birdcoder.app/Contents/Resources/app',
      'release/mac-arm64/birdcoder.app/Contents/Resources/app',
    ])
    const releaseGlobs = entries.map((entry) => {
      if (!isRecord(entry)) throw new TypeError('desktop release matrix entries must be records')
      return String(entry['release-files'])
    })
    for (const globs of releaseGlobs) {
      expect(globs).toContain('latest*.yml')
      expect(globs).toContain('*.blockmap')
    }
    for (const globs of releaseGlobs.slice(0, 4)) expect(globs).toContain('*.zip')
    for (const globs of releaseGlobs.slice(4)) {
      expect(globs).toContain('*.deb')
      expect(globs).toContain('*.rpm')
      expect(globs).toContain('*.tar.gz')
    }
  })

  it('publishes the Desktop matrix and native container archives from one dsh tag', () => {
    const workflow = loadWorkflow('.github/workflows/container-release.yml')
    const push = workflowEvent(workflow, 'push')
    const desktop = workflowJob(workflow, 'desktop')
    const image = workflowJob(workflow, 'container-image')
    const release = workflowJob(workflow, 'release')
    if (!isRecord(image.strategy) || !isRecord(image.strategy.matrix)
      || !Array.isArray(image.strategy.matrix.include) || !Array.isArray(release.steps)) {
      throw new TypeError('unified release must define the container image matrix and release steps')
    }

    expect(push).toEqual({ tags: ['birdcoder-v*'] })
    expect(desktop).toMatchObject({
      needs: 'resolve',
      uses: './.github/workflows/desktop-release.yml',
      with: { version: '${{ needs.resolve.outputs.version }}' },
    })
    expect(image.strategy.matrix.include).toEqual([
      { platform: 'linux/amd64', arch: 'amd64', os: 'ubuntu-24.04' },
      { platform: 'linux/arm64', arch: 'arm64', os: 'ubuntu-24.04-arm' },
    ])
    expect(release).toMatchObject({
      if: "github.event_name == 'push' && startsWith(github.ref, 'refs/tags/birdcoder-v')",
      needs: ['resolve', 'desktop', 'container-bundle', 'container-image'],
      concurrency: { group: 'dsh-github-release', 'cancel-in-progress': false },
      permissions: { contents: 'write' },
    })
    const serialized = JSON.stringify(workflow)
    expect(serialized).not.toContain('docker/login-action')
    expect(serialized).not.toContain('push: true')
    expect(serialized).not.toContain('packages: write')
    expect(serialized).toContain('assemble-github-release.ts')
    expect(serialized).toContain('test \\"$(wc -l < \\"$actual\\")\\" -eq 31')
    expect(serialized).toContain('latest-linux-arm64.yml')
    expect(serialized.match(/softprops\/action-gh-release@v2/g)).toHaveLength(1)
    const prepare = release.steps.filter(isRecord).find(step => step.name === 'Prepare retry-safe release state')
    const upload = release.steps.filter(isRecord).find(step => step.uses === 'softprops/action-gh-release@v2')
    const publish = release.steps.filter(isRecord).find(step => step.name === 'Verify exact release assets and publish the draft')
    if (typeof prepare?.run !== 'string' || typeof publish?.run !== 'string') {
      throw new TypeError('unified release must define retry preparation and draft verification scripts')
    }
    expect(prepare.run).toContain('gh api --paginate "repos/${GITHUB_REPOSITORY}/releases?per_page=100"')
    expect(prepare.run).toContain('select(.tag_name == env.GITHUB_REF_NAME)')
    expect(prepare.run).toContain('multiple releases exist for ${GITHUB_REF_NAME}')
    expect(prepare.run).toContain('--method DELETE')
    expect(prepare.run).not.toContain('|| true')
    expect(prepare.run).not.toContain('2>/dev/null')
    const downloads = release.steps.filter(isRecord).filter(step => step.uses === 'actions/download-artifact@v4')
    expect(downloads.map(step => step.with)).toEqual([
      { pattern: 'dsh-desktop-*', path: 'artifacts' },
      { pattern: 'birdcoder-container-*', path: 'artifacts' },
    ])
    expect(upload).toMatchObject({
      if: "steps.release-state.outputs.already-published != 'true'",
      with: { draft: true, prerelease: false, make_latest: false },
    })
    expect(publish.run).toContain('[.name, .size, .id, .digest]')
    expect(publish.run).toContain('releases?per_page=100')
    expect(publish.run).not.toContain('/releases/tags/')
    expect(publish.run).toContain("expected_digest=\"$(awk -v name=\"$name\" '$2 == name { print $1 }' release-assets/SHA256SUMS)\"")
    expect(publish.run).toContain('test "$remote_digest" = "sha256:${expected_digest}"')
    expect(publish.run).toContain('cmp "release-assets/${metadata}" "$downloaded"')
    expect(publish.run).toContain('-F draft=false')
    expect(publish.run).toContain('gh api --paginate --slurp "repos/${GITHUB_REPOSITORY}/releases?per_page=100"')
    expect(publish.run).toContain('scripts/release/select-github-latest.ts')
    expect(publish.run).toContain('--current-tag "$GITHUB_REF_NAME"')
    expect(publish.run).toContain('highest_tag="$(jq --raw-output \'.highestTag\' "$selection")"')
    expect(publish.run).toContain('make_latest="$(jq --raw-output \'.makeLatest\' "$selection")"')
    expect(publish.run).toContain('-F prerelease=false')
    expect(publish.run).toContain('-f make_latest="$make_latest"')
    expect(publish.run).toContain('"repos/${GITHUB_REPOSITORY}/releases/latest"')
    expect(publish.run).toContain('for attempt in {1..5}')
    expect(publish.run).toContain('[[ "$latest_tag" == "$highest_tag" ]]')
    expect(publish.run).toContain('sleep 2')
    expect(publish.run).not.toContain('RELEASE_MAKE_LATEST')
    expect(publish.run).not.toContain('if [[ "$release_draft"')
  })

  it('keeps package architecture out of the electron-builder targets', () => {
    const config: unknown = yaml.load(readFileSync(resolve(root, 'apps/desktop/electron-builder.yml'), 'utf8'))
    if (!isRecord(config) || !isRecord(config.win) || !isRecord(config.mac) || !isRecord(config.linux)
      || !isRecord(config.deb) || !isRecord(config.rpm)) {
      throw new TypeError('desktop electron-builder config must define win, mac, linux, deb, and rpm targets')
    }

    expect(config.win.target).toEqual(['nsis', 'zip'])
    expect(config.mac.target).toEqual(['dmg', 'zip'])
    expect(config.linux.target).toEqual(['AppImage', 'deb', 'rpm', 'tar.gz'])
    expect(config.artifactName).toBe('BirdCoder-${version}-${os}-${arch}.${ext}')
    expect(config.linux).toMatchObject({
      category: 'Development',
      maintainer: 'SDKWork AI <support@sdkwork.com>',
    })
    expect(config.deb).toMatchObject({ packageName: 'birdcoder' })
    expect(config.rpm).toMatchObject({ packageName: 'birdcoder' })
    expect(config.toolsets).toMatchObject({ appimage: '1.0.3' })
  })
})

describe('Python release workflows', () => {
  it('keeps complete wheel validation separate from protected public publication', () => {
    const workflow = loadWorkflow('.github/workflows/python-release.yml')
    const dispatch = workflowEvent(workflow, 'workflow_dispatch')
    const pullRequest = workflowEvent(workflow, 'pull_request')
    const build = workflowJob(workflow, 'build')
    const pythonCompat = workflowJob(workflow, 'python-compat')
    const validate = workflowJob(workflow, 'validate')
    const publishRuntime = workflowJob(workflow, 'publish-runtime')
    const publishSdk = workflowJob(workflow, 'publish-sdk')
    if (!isRecord(dispatch.inputs)
      || !isRecord(dispatch.inputs.publish)
      || !Array.isArray(pythonCompat.steps)
      || !Array.isArray(validate.steps)
      || !Array.isArray(publishRuntime.steps)
      || !Array.isArray(publishSdk.steps)) {
      throw new TypeError('Python release workflow must define publish input and release steps')
    }

    expect(dispatch.inputs.publish).toMatchObject({ type: 'boolean', default: false })
    expect(pullRequest).toEqual({ types: ['labeled'] })
    expect(build).toMatchObject({
      if: "github.event_name == 'workflow_dispatch' || github.event.label.name == 'python-release-dry-run'",
      uses: './.github/workflows/build-exe-for-python-sdk.yml',
      with: {
        targets: 'node24-linux-x64,node24-linux-arm64,node24-macos-arm64',
        release: true,
      },
    })
    expect(pythonCompat.strategy).toMatchObject({ matrix: { python: ['3.10', '3.14'] } })
    expect(JSON.stringify(pythonCompat.steps)).toContain('deepseek-harness-sdk==${{ steps.compatibility-version.outputs.version }}')
    const validateSteps = JSON.stringify(validate.steps)
    const authorize = validate.steps.filter(isRecord).find(step => step.name === 'Authorize publication request')
    if (!isRecord(authorize) || typeof authorize.run !== 'string') {
      throw new TypeError('Python release validation must authorize publication requests')
    }
    expect(validateSteps).toContain('PUBLIC_PYPI_RELEASE_ENABLED')
    expect(authorize).toMatchObject({
      env: {
        PYPI_PUBLISHER_REPOSITORY: '${{ vars.PYPI_PUBLISHER_REPOSITORY }}',
        REPOSITORY: '${{ github.repository }}',
      },
    })
    expect(authorize.run).toContain('[ "$REPOSITORY" = "$PYPI_PUBLISHER_REPOSITORY" ]')
    expect(validateSteps).toContain('100000000')
    expect(publishRuntime).toMatchObject({
      if: "github.event_name == 'workflow_dispatch' && inputs.publish",
      needs: 'validate',
      environment: 'pypi-runtime',
      permissions: { contents: 'read', 'id-token': 'write' },
    })
    expect(publishSdk).toMatchObject({
      if: "github.event_name == 'workflow_dispatch' && inputs.publish",
      needs: ['validate', 'publish-runtime'],
      environment: 'pypi',
      permissions: { contents: 'read', 'id-token': 'write' },
    })
    const runtimeSteps = publishRuntime.steps.filter(isRecord)
    const sdkSteps = publishSdk.steps.filter(isRecord)
    const runtimePublish = runtimeSteps.find(step => step.name === 'Publish runtime wheels')
    const sdkPublish = sdkSteps.find(step => step.name === 'Publish SDK wheel')
    const runtimeHashes = runtimeSteps.find(step => step.name === 'Verify release artifact hashes')
    const sdkHashes = sdkSteps.find(step => step.name === 'Verify release artifact hashes')
    expect([...runtimeSteps, ...sdkSteps].some(
      step => typeof step.uses === 'string' && step.uses.startsWith('actions/checkout@'),
    )).toBe(false)
    expect([...runtimeSteps, ...sdkSteps].filter(
      step => step.uses === 'pypa/gh-action-pypi-publish@release/v1',
    )).toHaveLength(2)
    expect(runtimePublish).toMatchObject({
      with: { 'packages-dir': 'dist/runtime/', attestations: false },
    })
    expect(sdkPublish).toMatchObject({
      with: { 'packages-dir': 'dist/sdk/', attestations: false },
    })
    expect(runtimeHashes).toMatchObject({ run: 'cd dist && sha256sum -c SHA256SUMS' })
    expect(sdkHashes).toMatchObject({ run: 'cd dist && sha256sum -c SHA256SUMS' })
  })

  it('exposes the native wheel builder to the release caller with normalized versions', () => {
    const workflow = loadWorkflow('.github/workflows/build-exe-for-python-sdk.yml')
    const call = workflowEvent(workflow, 'workflow_call')
    const plan = workflowJob(workflow, 'plan')
    const build = workflowJob(workflow, 'build')
    if (!isRecord(call.inputs) || !Array.isArray(plan.steps) || !Array.isArray(build.steps)) {
      throw new TypeError('Python wheel builder must define workflow_call inputs and plan steps')
    }

    const buildSteps: unknown[] = build.steps
    const manylinuxAddon = buildSteps.find(step => isRecord(step) && step.name === 'Rebuild Linux node-pty against manylinux 2.28')
    const macosCheck = buildSteps.find(step => isRecord(step) && step.name === 'Check macOS deployment target')
    const manylinuxSmoke = buildSteps.find(step => isRecord(step) && step.name === 'Run wheel in a manylinux 2.28 container')
    expect(call.inputs).toHaveProperty('targets')
    expect(call.inputs).toMatchObject({
      ci: { type: 'boolean', default: false },
      release: { type: 'boolean', default: false },
    })
    expect(workflow.concurrency).toMatchObject({
      group: 'build-single-exe-${{ github.workflow }}-${{ github.ref }}',
    })
    expect(plan.if).toContain('inputs.ci')
    expect(plan.if).toContain('inputs.release')
    expect(JSON.stringify(plan.steps)).toContain('pep440_version')
    expect(JSON.stringify(workflow)).toContain('macosx_14_0_arm64')
    expect(manylinuxAddon).toMatchObject({ if: "runner.os == 'Linux'" })
    expect(JSON.stringify(manylinuxAddon)).toContain('manylinux_2_28_x86_64')
    expect(JSON.stringify(manylinuxAddon)).toContain('manylinux_2_28_aarch64')
    expect(JSON.stringify(manylinuxAddon)).toContain('$HOME/setup-pnpm:$HOME/setup-pnpm:ro')
    expect(JSON.stringify(manylinuxAddon)).toContain('node-pty-glibc-versions.txt')
    expect(JSON.stringify(manylinuxAddon)).toContain('le 2.28')
    expect(macosCheck).toMatchObject({ if: "runner.os == 'macOS'" })
    expect(JSON.stringify(macosCheck)).toContain('scripts/check-macos-deployment-target.py')
    expect(JSON.stringify(macosCheck)).toContain('$EXE-spawn-helper')
    expect(manylinuxSmoke).toMatchObject({ if: "runner.os == 'Linux'" })
    expect(JSON.stringify(manylinuxSmoke)).toContain('-e DSH_TELEMETRY_DISABLED')
  })

  it('uses the shared macOS deployment-target check in GitLab', () => {
    const workflow = loadWorkflow('.gitlab-ci.yml')
    const runtimeWheel = workflow['.runtime-wheel']
    if (!isRecord(runtimeWheel) || !Array.isArray(runtimeWheel.script)) {
      throw new TypeError('GitLab CI must define the runtime wheel script')
    }
    const runtimeScript: unknown[] = runtimeWheel.script
    const macosCheck = runtimeScript.find(
      step => typeof step === 'string' && step.includes('PLATFORM" = macos-arm64'),
    )
    if (typeof macosCheck !== 'string') {
      throw new TypeError('GitLab CI must check the macOS deployment target')
    }

    expect(macosCheck).toContain('scripts/check-macos-deployment-target.py')
    expect(macosCheck).toContain('"$EXE" "$EXE-spawn-helper"')
  })
})

describe('Issue lifecycle workflow', () => {
  it('uses explicit review handoff events without rerunning when a draft becomes ready', () => {
    const lifecycle = loadWorkflow('.github/workflows/issue-lifecycle.yml')
    const lifecyclePullRequest = workflowEvent(lifecycle, 'pull_request')
    const lifecycleReview = workflowEvent(lifecycle, 'pull_request_review')
    const lifecycleJob = workflowJob(lifecycle, 'lifecycle')
    const policy = loadWorkflow('.github/workflows/issue-policy.yml')
    const policyPullRequest = workflowEvent(policy, 'pull_request')

    expect(lifecyclePullRequest.types).not.toContain('ready_for_review')
    expect(lifecyclePullRequest.types).toContain('review_requested')
    expect(lifecycleReview.types).toEqual(['submitted'])
    expect(lifecycleJob.if).toBe(
      "${{ github.event_name != 'pull_request_review' || (github.event.action == 'submitted' && github.event.review.state == 'changes_requested') }}",
    )
    expect(policyPullRequest.types).toContain('ready_for_review')
  })
})

describe('Git hooks', () => {
  it('leaves frozen Agent Note sidecars to the archive verifier', () => {
    const lefthook = loadWorkflow('lefthook.yml')

    for (const hookName of ['pre-commit', 'pre-merge-commit']) {
      const hook = lefthook[hookName]
      if (!isRecord(hook) || !Array.isArray(hook.jobs)) {
        throw new TypeError(`lefthook must define ${hookName} jobs`)
      }
      const pairing: unknown = hook.jobs.find(
        (job: unknown) => isRecord(job) && job.name === 'translation pairing (staged records)',
      )

      expect(pairing).toMatchObject({ exclude: ['.agents/notes/archived/**'] })
    }
  })
})

function loadWorkflow(path: string): Record<string, unknown> {
  const workflow: unknown = yaml.load(readFileSync(resolve(root, path), 'utf8'))
  if (!isRecord(workflow)) throw new TypeError(`${path} must define a workflow`)
  return workflow
}

function workflowEvent(workflow: Record<string, unknown>, event: string): Record<string, unknown> {
  if (!isRecord(workflow.on) || !isRecord(workflow.on[event])) {
    throw new TypeError(`workflow must define the ${event} event`)
  }
  return workflow.on[event]
}

function workflowJob(workflow: Record<string, unknown>, job: string): Record<string, unknown> {
  if (!isRecord(workflow.jobs) || !isRecord(workflow.jobs[job])) {
    throw new TypeError(`workflow must define the ${job} job`)
  }
  return workflow.jobs[job]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
