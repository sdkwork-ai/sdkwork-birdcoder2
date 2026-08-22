/**
 * Verify a release family's version baseline and that its pack order resolves.
 *
 * The pack order is the release's own plan: it decides the sequence in which
 * the tarballs are written, and printing it on every pull request is what makes
 * a change to the order reviewable rather than only observable during a pack.
 *
 * `--require-tag` additionally asserts the run comes from a tag of the family
 * that names a version the working tree carries. The documentation site uses
 * it: the site presents a released snapshot, so deployment must be an explicit
 * act from a release tag.
 */

import { parseArgs } from 'node:util'
import { isEntry } from './process.ts'
import { releaseFamily, type PublishPlan, type ReleaseFamily, type ReleaseMember } from './families.ts'

/**
 * Print the pack order the release will follow, and the peer declarations it
 * leaves unordered.
 *
 * npm treats an unmet peer as a warning, so unordered peers order nothing and
 * block nothing.
 * @param family - the release family.
 * @param plan - the resolved order and its dropped edges.
 */
function reportPublishOrder(family: ReleaseFamily, plan: PublishPlan): void {
  console.log(`release verify: pack order for family ${family.id}, ${String(plan.order.length)} member(s):`)
  const width = String(plan.order.length).length
  for (const [index, member] of plan.order.entries()) {
    console.log(`  ${String(index + 1).padStart(width, ' ')}  ${member.name}@${member.version}`)
  }
  if (plan.droppedPeerEdges.length === 0) return
  console.log(
    `release verify: ${String(plan.droppedPeerEdges.length)} peer declaration(s) pack unordered,`
    + ' because the peer cannot precede the package declaring it without contradicting a dependency edge'
    + ' or its own cycle:',
  )
  for (const edge of plan.droppedPeerEdges) console.log(`  ${edge.consumer} -> ${edge.peer}`)
}

/**
 * Assert the run comes from a tag this family releases from, and that the tag
 * names a version the family actually carries.
 * @param family - the release family.
 * @param members - the family's members.
 * @param ref - the `GITHUB_REF` value.
 */
function verifyTag(family: ReleaseFamily, members: readonly ReleaseMember[], ref: string): void {
  const prefix = 'refs/tags/'
  if (!ref.startsWith(prefix)) {
    throw new Error(`release family ${family.id} requires running from a ${family.tagPrefix}* tag, got ${ref || '(no ref)'}`)
  }
  const tag = ref.slice(prefix.length)
  if (!tag.startsWith(family.tagPrefix)) {
    throw new Error(`tag ${tag} does not belong to release family ${family.id} (expected ${family.tagPrefix}*)`)
  }
  const expected = members.map(member => family.tagFor(member))
  if (!expected.includes(tag)) {
    throw new Error(`tag ${tag} names no version this family carries; its members would tag as:\n${[...new Set(expected)].join('\n')}`)
  }
}

/** Run the verification for the family named by `--family`. */
function main(): void {
  const { values } = parseArgs({
    options: {
      family: { type: 'string' },
      'require-tag': { type: 'boolean', default: false },
    },
    allowPositionals: false,
  })
  if (values.family === undefined) throw new Error('usage: verify.ts --family <dsh|vendor> [--require-tag]')

  const family = releaseFamily(values.family)
  const root = process.cwd()
  const versionMembers = family.versionMembers(root)
  const publishMembers = family.publishMembers(root)
  family.verifyVersions(versionMembers)
  // Resolve the pack order here, before the build: an install-edge cycle
  // makes the order unrepresentable, and that has to surface at the first gate
  // rather than when pack is already writing tarballs.
  const plan = family.publishOrder(publishMembers)
  if (plan.order.length !== publishMembers.length) {
    throw new Error(
      `release family ${family.id}: pack order covers ${String(plan.order.length)} of ${String(publishMembers.length)} pack members`,
    )
  }
  reportPublishOrder(family, plan)
  if (values['require-tag'] === true) verifyTag(family, versionMembers, process.env.GITHUB_REF ?? '')

  const versions = [...new Set(versionMembers.map(member => member.version))]
  const summary = versions.length === 1 ? versions[0] : `${String(versions.length)} versions`
  console.log(
    `release verify: family ${family.id}, ${String(versionMembers.length)} version member(s),`
    + ` ${String(publishMembers.length)} pack member(s), ${summary},`
    + ` pack order resolved, ${String(plan.droppedPeerEdges.length)} peer declaration(s) unordered`
    + (values['require-tag'] === true ? ', tag gate passed' : ''),
  )
}

if (isEntry(import.meta.url)) main()
