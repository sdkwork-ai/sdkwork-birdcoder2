/**
 * The welcome notice's settings namespace and acknowledgement version, read
 * from the browser package that owns them.
 *
 * A host-side project cannot import a browser package: doing so would pull that
 * package's complete TS project into this graph (the same constraint
 * `apps/web/tests/scaffold.ts` documents for its mirrored constants). The
 * namespace is precisely the value the reader and the composed loader row have
 * to agree on, so reading the reader's own source turns an upstream rename into
 * a failure here rather than a namespace the Host refuses to write
 * (`No configurable plugin entry "<ns>"`).
 * @module
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const COPY = fileURLToPath(new URL('../../../client/ui-settings-models/src/onboarding-copy.ts', import.meta.url))

/** One `export const NAME = '<value>'` out of the reader's source. */
function readConstant(name: string): string {
  const match = new RegExp(`${name} = '([^']+)'`).exec(readFileSync(COPY, 'utf8'))
  if (match?.[1] === undefined) throw new Error(`cannot read ${name} from ${COPY}`)
  return match[1]
}

/** The loader row id the browser welcome step resolves its config form through. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = readConstant('WELCOME_NOTICE_SETTINGS_NAMESPACE')

/** The acknowledgement the notice writes into that namespace; its absence re-offers the notice. */
export const WELCOME_NOTICE_VERSION = readConstant('WELCOME_NOTICE_VERSION')
