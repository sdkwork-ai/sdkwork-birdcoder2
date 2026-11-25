import { describe, expect, it } from 'vitest'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/client/locales.ts'

/** Every locale dictionary must carry the gallery sort copy. */
const dictionaries = { zh, en, ja, es, fr, de, ru, pt } as const
const sortKeys = ['settings.sort.label', 'settings.sort.default', 'settings.sort.enabled', 'settings.sort.name'] as const

describe('expert gallery locale copy', () => {
  it('defines the sort labels in every locale', () => {
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      for (const key of sortKeys) {
        expect(dictionary[key], `${locale} ${key}`).toBeTruthy()
      }
    }
  })

  it('keeps every locale key-identical to the Chinese source dictionary', () => {
    const expected = Object.keys(zh).sort()
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      expect(Object.keys(dictionary).sort(), locale).toEqual(expected)
    }
  })
})
