/**
 * Verify the lockfile resolves the react family (react / react-dom / @types/react /
 * @types/react-dom) to exactly ONE version each.
 *
 * Why: the fork runs a react 19 overlay over upstream's react 18 manifests via
 * pnpm `overrides` (pnpm-workspace.yaml). An upstream merge can introduce a NEW
 * react-family specifier the overrides do not match (for example a new exact pin
 * or a wider range in a sibling manifest). pnpm then silently materializes a
 * SECOND @types/react copy, and every federated sdkwork JSX surface fails with
 * `TS2786: 'X' cannot be used as a JSX component ... Type 'bigint' is not
 * assignable to type 'ReactNode'` (the 19 types add `bigint` to ReactNode; the
 * 18 types do not — two copies are structurally incompatible). This gate turns
 * that failure mode into an actionable lockfile error right after a merge,
 * before any build or typecheck runs.
 *
 * Remedy when it fails: extend the `overrides` (and, if needed, the `catalog`)
 * react rows in pnpm-workspace.yaml so the new specifier converges onto the
 * same single version, then `pnpm install` and re-run this gate.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

/** The react-family packages whose copies must converge onto one version each. */
const REACT_FAMILY_PACKAGES = ['react', 'react-dom', '@types/react', '@types/react-dom'] as const

const LOCKFILE_PACKAGE_KEY = /^\s{2}'?((?:@[^\s/]+\/)?[^\s/@][^\s/@]*|@[^\s/]+)@([^\s'(]+)'?(?:\(.*)?:$/

interface LockfileFamilyVersions {
  readonly [packageName: string]: ReadonlySet<string>
}

/**
 * Collects the distinct resolved versions per react-family package from the
 * lockfile `packages:`/`snapshots:` sections. Peer-suffix keys such as
 * `react-dom@19.2.8(react@19.2.8):` contribute the head version only — the
 * suffix may legitimately mention other react-family versions.
 */
export function collectReactFamilyVersions(lockfile: string): LockfileFamilyVersions {
  const versions = new Map<string, Set<string>>()
  for (const packageName of REACT_FAMILY_PACKAGES) versions.set(packageName, new Set())
  for (const line of lockfile.split(/\r?\n/)) {
    const match = LOCKFILE_PACKAGE_KEY.exec(line)
    if (!match?.[1] || !match[2]) continue
    const [name, version] = [match[1], match[2]]
    versions.get(name)?.add(version)
  }
  return Object.fromEntries([...versions].map(([name, set]) => [name, set]))
}

export function verifyReactTypesConvergence(root: string, lockfileContent?: string): string[] {
  const lockfilePath = resolve(root, 'pnpm-lock.yaml')
  let lockfile: string
  try {
    lockfile = lockfileContent ?? readFileSync(lockfilePath, 'utf8')
  } catch {
    return [`pnpm-lock.yaml not found at ${lockfilePath}; run \`pnpm install\` first.`]
  }
  const versions = collectReactFamilyVersions(lockfile)
  const errors: string[] = []
  for (const packageName of REACT_FAMILY_PACKAGES) {
    const resolved = [...(versions[packageName] ?? new Set<string>())].sort()
    if (resolved.length <= 1) continue
    errors.push(
      `${packageName} resolves to ${resolved.length} copies in pnpm-lock.yaml: ${resolved.join(', ')}.`,
    )
  }
  if (errors.length > 0) {
    errors.push(
      'Mixed react-family copies break federated JSX typechecking (TS2786: lucide-react / react-router-dom elements, bigint ReactNode mismatch).',
      'Fix: add the newly merged specifier to the react rows under `overrides` in pnpm-workspace.yaml so every copy converges onto one version, then run `pnpm install`.',
    )
  }
  return errors
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    root: { type: 'string' },
  },
})
const root = resolve(values.root ?? resolve(import.meta.dirname, '..'))
const errors = verifyReactTypesConvergence(root)
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log('verify-react-types-convergence: react family resolves to a single version in the lockfile.')
}
