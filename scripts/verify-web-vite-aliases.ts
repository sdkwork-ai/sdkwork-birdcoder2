/** Fail fast when apps/web Vite source aliases point at missing files. */
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Validate that every apps/web source alias target exists on disk.
 * @param harnessRoot - repository root.
 * @returns diagnostics; an empty array means the checks passed.
 */
export async function verifyWebViteAliases(harnessRoot: string): Promise<string[]> {
  const aliasesModuleUrl = pathToFileURL(resolve(harnessRoot, 'apps/web/vite-source-aliases.ts')).href
  const { WEB_SOURCE_ALIASES } = await import(aliasesModuleUrl) as {
    WEB_SOURCE_ALIASES: ReadonlyArray<{ replacement: string }>
  }

  const errors: string[] = []
  for (const alias of WEB_SOURCE_ALIASES) {
    if (existsSync(alias.replacement)) continue
    errors.push(
      `${relative(harnessRoot, alias.replacement).replaceAll('\\', '/')}: apps/web Vite alias target is missing; update apps/web/vite-source-aliases.ts after renaming the web shell entry`,
    )
  }
  return errors
}

const root = resolve(import.meta.dirname, '..')
if (import.meta.main) {
  const errors = await verifyWebViteAliases(root)
  if (errors.length > 0) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else {
    console.log('verify-web-vite-aliases: apps/web source alias targets are valid.')
  }
}
