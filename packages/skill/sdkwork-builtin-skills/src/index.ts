/**
 * SDKWork fork bundled scene-skill provider.
 *
 * The `birdcoder-*` scene skills are product content: the composer tag strip in
 * `@deepseek-ai/dsh-client-ui-sdkwork-app-modes` inserts their names as
 * `/birdcoder-…` tokens, and a token only becomes a decorated, openable
 * reference when the session skill catalog advertises that name. A checkout-local
 * skill directory can never supply them, because the user's Workspace is not
 * this repository, so the skills travel inside this package instead.
 *
 * The plugin mounts one filesystem root — the packaged `assets/skills`
 * directory — at the bundled rank with default roots and watching off. That
 * reuses the shared directory discovery (frontmatter parsing, rank precedence,
 * absolute `SKILL.md` paths for reference previews) while keeping every
 * project, custom, and user root owned by the preset's own provider row.
 *
 * @module @deepseek-ai/dsh-sdkwork-builtin-skills
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import {
  apply as applyFilesystemSkills,
  type Config as SkillFilesystemConfig,
} from '@deepseek-ai/dsh-skill-filesystem'

export const name = 'sdkwork-builtin-skills'
export const inject = ['skills']

/** Packaged skill root: one directory per skill, each holding its `SKILL.md`. */
export const BUNDLED_SKILLS_DIR = fileURLToPath(new URL('../assets/skills/', import.meta.url))

/** Provider name this root announces to the skill registry. */
export const PROVIDER_NAME = 'sdkwork-builtin'

const CONFIG: SkillFilesystemConfig = {
  providerName: PROVIDER_NAME,
  // The packaged root is the whole contribution: no project, custom, or user
  // directories, which the preset's own provider row already owns.
  includeDefaultRoots: false,
  // Shipped assets never change under a running process.
  watch: false,
  bundledSkillDir: BUNDLED_SKILLS_DIR,
}

/**
 * Register the packaged skill root on `ctx.skills`.
 * @param ctx - host context carrying the skill registry.
 */
export function apply(ctx: Context): void {
  applyFilesystemSkills(ctx, CONFIG)
}
