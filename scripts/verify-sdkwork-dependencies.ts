/** Verify local SDKWork paths and optional pinned online checkouts. */
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { verifySdkworkDependencies } from './sdkwork-dependencies.ts'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    online: { type: 'boolean', default: false },
    root: { type: 'string' },
  },
})
const root = resolve(values.root ?? resolve(import.meta.dirname, '..'))
const errors = verifySdkworkDependencies(root, { online: values.online })
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  const subject = values.online ? 'online Git checkouts and workspace inputs' : 'workspace inputs'
  console.log(`verify-sdkwork-dependencies: ${subject} are valid.`)
}
