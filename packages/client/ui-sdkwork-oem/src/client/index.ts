/**
 * OEM brand plugin, browser half: reads the page projection the Host's OEM
 * profile published, hands the display name to the locale registry (every
 * shipped dictionary string that spells `BirdCoder` renders the deployment's
 * name from then on), and titles the document with it. Without an OEM profile
 * the projection is absent and both stay on the shipped `BirdCoder` brand.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { readOemBrandName } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls ctx.locale (the LocaleRuntime) into this program.
import type {} from '@deepseek-ai/dsh-client-locale/client'

/** Service required by this plugin: the locale registry that owns translated copy. */
export const inject = ['locale']

/**
 * Apply the page's OEM brand once at boot.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const brand = readOemBrandName()
  ctx.locale.setBrand(brand)
  // The shell ships the product name as the document title; an OEM deployment
  // replaces it so window titles, tab labels, and task switchers agree.
  if (typeof document !== 'undefined') document.title = brand
}
