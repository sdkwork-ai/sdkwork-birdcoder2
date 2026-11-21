/** Stage local-branded DSH packages for unsigned Desktop builds without a publication record. */

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  assertClientBuildEnvironmentIgnoringGitDirty,
  readClientBuildRecord,
  repositoryClientBuildEnvironment,
  resolveClientBuildEnvironment,
} from '../../../scripts/client-build-environment.ts'
import { releaseFamily } from '../../../scripts/release/families.ts'
import { packFamilyMembers, parsePackConcurrency } from '../../../scripts/release/pack.ts'

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, concurrency: { type: 'string' } },
    allowPositionals: false,
  })
  if (values.out === undefined) throw new Error('desktop local pack: --out must name the package staging directory')
  const concurrency = parsePackConcurrency(values.concurrency)
  const root = process.cwd()
  const environment = resolveClientBuildEnvironment(repositoryClientBuildEnvironment(root), 'local')
  // The record is verified against the artifacts before its values are used.
  // Read it without a live-environment assertion first, because the Git dirty
  // marker was captured when the build started and a build gate may have
  // changed the worktree before this pack step sampled it again.
  const record = readClientBuildRecord(root)
  if ((environment.DSH_CLIENT_GIT_DIRTY === 'true')
    !== (record.environment.DSH_CLIENT_GIT_DIRTY === 'true')) {
    let status = '(unavailable)'
    try {
      status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || '(none)'
    } catch {
      status = '(unavailable)'
    }
    console.log(`desktop local pack: Git dirty state changed after the client build; entries:\n${status}`)
  }
  assertClientBuildEnvironmentIgnoringGitDirty(record.environment, environment)
  const destination = resolve(root, values.out)
  const packed = await packFamilyMembers(root, releaseFamily('dsh'), destination, concurrency)
  console.log(`desktop local pack: ${String(packed.length)} tarball(s) in ${destination}`)
}

await main()
