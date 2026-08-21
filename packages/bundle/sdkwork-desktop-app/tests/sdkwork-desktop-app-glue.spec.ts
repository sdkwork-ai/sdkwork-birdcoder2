/**
 * Desktop-app glue behavior: the desktop-surface prompt section and the
 * harness-source section register against the systemPrompt service, with the
 * desktop text replacing the web runtime's URL-based surface.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/index.ts'

interface PromptEntry {
  name: string
  order: number
  text: string | (() => string)
}

/** A fake systemPrompt whose section registrations are recorded. */
function fakeSystemPrompt(): {
  service: { section(entry: PromptEntry): () => void }
  sections: { name: string; text: string }[]
} {
  const sections: { name: string; text: string }[] = []
  const service = {
    section: (entry: PromptEntry) => {
      sections.push({ name: entry.name, text: typeof entry.text === 'function' ? entry.text() : entry.text })
      return () => {}
    },
  }
  return { service, sections }
}

describe('sdkwork-desktop-app glue', () => {
  it('registers the harness-source and desktop-surface prompt sections', async () => {
    const ctx = new Context()
    const fake = fakeSystemPrompt()
    apply(ctx)
    // Mount the provider as a plugin fiber (mirroring the web-app test's
    // SystemPrompt mount); its provide starts the inject-waiting glue fiber.
    const provider = ctx.plugin({ apply: (child: Context) => { child.provide('systemPrompt', fake.service) } })
    await provider
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(fake.sections.map(section => section.name)).toEqual(['harness:source', 'app:desktop-surface'])
    const desktop = fake.sections.find(section => section.name === 'app:desktop-surface')
    expect(desktop?.text).toContain('desktop application')
    expect(desktop?.text).toContain('no server URL')
    expect(desktop?.text).not.toContain('http://')
    const harness = fake.sections.find(section => section.name === 'harness:source')
    expect(harness?.text).toContain('DeepSeek Harness implementation checkout')
  })

  it('does nothing when no systemPrompt service exists', async () => {
    const ctx = new Context()
    expect(() => { apply(ctx) }).not.toThrow()
  })
})
