/**
 * Skill-preferences service spec: the projection from a settings scope into the
 * cross-plugin view. Covers the states the view can be in (no section yet, an
 * unregistered namespace, a ready section), the resolved `hidden` membership
 * set the strip consumes, reference stability across a no-op republish,
 * listener containment, and teardown.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { SkillPreferencesService } from '../src/client/skill-preferences.ts'
import {
  DISABLED_SKILLS_FIELD, HIDDEN_SCENE_TAGS_FIELD, PINNED_SCENE_TAGS_FIELD, type UiSkillsSettings,
} from '../src/skills-settings.ts'

/** A settings scope stand-in whose snapshot the test drives by hand. */
function scopeOf(status: SettingsScopeSnapshot<UiSkillsSettings>['status']) {
  let snapshot: SettingsScopeSnapshot<UiSkillsSettings> = {
    status,
    value: undefined,
    base: undefined,
    user: undefined,
    revision: undefined,
    writable: false,
    mode: 'host',
  }
  const listeners = new Set<() => void>()
  const scope = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: vi.fn(() => Promise.resolve()),
    unset: vi.fn(() => Promise.resolve()),
    mutate: vi.fn(() => Promise.resolve()),
  }
  return {
    scope: scope as unknown as SettingsScope<UiSkillsSettings>,
    /** Publish a new snapshot and notify, the way the controller does. */
    publish: (next: SettingsScopeSnapshot<UiSkillsSettings>) => {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
    listenerCount: () => listeners.size,
  }
}

/** A ready snapshot carrying one disabled name, one hidden tag, and one pinned tag. */
function readySnapshot(): SettingsScopeSnapshot<UiSkillsSettings> {
  return {
    status: 'ready',
    value: {
      [DISABLED_SKILLS_FIELD]: ['birdcoder-tts'],
      [HIDDEN_SCENE_TAGS_FIELD]: ['birdcoder-daily-dev'],
      [PINNED_SCENE_TAGS_FIELD]: ['team-notes'],
    },
    base: undefined,
    user: undefined,
    revision: 1,
    writable: true,
    mode: 'host',
  }
}

describe('SkillPreferencesService', () => {
  it('reads nothing and refuses writes before a section stands', () => {
    const { scope } = scopeOf('loading')
    const service = new SkillPreferencesService(new Context(), scope)

    expect(service.getSnapshot()).toEqual({
      disabled: [], hiddenTags: [], pinnedTags: [], hidden: new Set(), writable: false,
    })
    service.dispose()
  })

  it('projects a ready section and publishes it to subscribers', () => {
    const { scope, publish } = scopeOf('loading')
    const service = new SkillPreferencesService(new Context(), scope)
    const listener = vi.fn()
    const off = service.subscribe(listener)

    publish(readySnapshot())

    expect(listener).toHaveBeenCalledTimes(1)
    expect(service.getSnapshot()).toEqual({
      disabled: ['birdcoder-tts'],
      hiddenTags: ['birdcoder-daily-dev'],
      pinnedTags: ['team-notes'],
      hidden: new Set(['birdcoder-daily-dev']),
      writable: true,
    })
    off()
    service.dispose()
  })

  it('keeps the snapshot reference stable across a no-op republish', () => {
    const { scope, publish } = scopeOf('ready')
    const service = new SkillPreferencesService(new Context(), scope)
    const before = service.getSnapshot()
    // The same section arrives again (a document commit that changed another
    // namespace): consumers must not re-render off an unchanged view.
    const listener = vi.fn()
    const off = service.subscribe(listener)

    publish(readySnapshot())

    const after = service.getSnapshot()
    expect(after).not.toBe(before)
    expect(listener).toHaveBeenCalledTimes(1)
    const settled = service.getSnapshot()
    publish({ ...readySnapshot(), revision: 2 })
    expect(service.getSnapshot()).toBe(settled)
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    service.dispose()
  })

  it('drops a section that is no longer available', () => {
    const { scope, publish } = scopeOf('loading')
    const service = new SkillPreferencesService(new Context(), scope)
    publish(readySnapshot())
    expect(service.getSnapshot().disabled).toEqual(['birdcoder-tts'])

    publish({ ...readySnapshot(), status: 'unavailable', value: undefined })

    expect(service.getSnapshot()).toEqual({
      disabled: [], hiddenTags: [], pinnedTags: [], hidden: new Set(), writable: false,
    })
    service.dispose()
  })

  it('applies the resolved membership set to the strip direction', () => {
    const { scope, publish } = scopeOf('loading')
    const service = new SkillPreferencesService(new Context(), scope)

    publish(readySnapshot())

    // The strip applies `hidden` per tag; the empty case must still be a set so
    // a consumer can test membership without a branch.
    const view = service.getSnapshot()
    expect(view.hidden.has('birdcoder-daily-dev')).toBe(true)
    expect(view.hidden.has('team-notes')).toBe(false)
    expect(view.pinnedTags).toEqual(['team-notes'])
    service.dispose()
  })

  it('ignores a section whose fields are not name lists', () => {
    const { scope, publish } = scopeOf('ready')
    const service = new SkillPreferencesService(new Context(), scope)

    // A section the Host resolved without this package's schema: the read is
    // total, and a non-list field degrades to "nothing preferred".
    publish({
      ...readySnapshot(),
      value: {
        [DISABLED_SKILLS_FIELD]: 'not-a-list',
        [HIDDEN_SCENE_TAGS_FIELD]: [1, 'ok'],
        [PINNED_SCENE_TAGS_FIELD]: undefined,
      },
    } as unknown as SettingsScopeSnapshot<UiSkillsSettings>)

    expect(service.getSnapshot().disabled).toEqual([])
    expect(service.getSnapshot().hiddenTags).toEqual(['ok'])
    expect(service.getSnapshot().pinnedTags).toEqual([])
    expect(service.getSnapshot().hidden).toEqual(new Set(['ok']))
    service.dispose()
  })

  it('contains a failing listener so the rest still hear the change', () => {
    const { scope, publish } = scopeOf('loading')
    const service = new SkillPreferencesService(new Context(), scope)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const healthy = vi.fn()
    service.subscribe(() => { throw new Error('consumer exploded') })
    service.subscribe(healthy)

    publish(readySnapshot())

    expect(healthy).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
    service.dispose()
  })

  it('stops notifying and detaches from the scope once disposed', () => {
    const { scope, publish, listenerCount } = scopeOf('loading')
    const service = new SkillPreferencesService(new Context(), scope)
    const listener = vi.fn()
    service.subscribe(listener)

    service.dispose()
    publish(readySnapshot())

    expect(listener).not.toHaveBeenCalled()
    expect(listenerCount()).toBe(0)
  })
})
