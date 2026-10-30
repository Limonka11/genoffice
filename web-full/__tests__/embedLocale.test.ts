import { describe, expect, it } from 'vitest'
import { htmlLang } from '@genoffice/i18n'
import { embedLang } from '../embedLocale'

describe('embedLang', () => {
  it("takes the host's ?lang= when embedded; unsupported or missing means English", () => {
    expect(embedLang('?lang=de', true)).toBe('de')
    expect(embedLang('?lang=en', true)).toBe('en')
    expect(embedLang('?lang=fr&doc=x', true)).toBe('fr')
    expect(embedLang('?lang=bg', true)).toBe('en')
    expect(embedLang('', true)).toBe('en')
    expect(embedLang('?lang=', true)).toBe('en')
  })

  it('stays English outside an embed', () => {
    expect(embedLang('?lang=de', false)).toBe('en')
  })

  it('pairs each language with its HTML locale', () => {
    expect(['de', 'en', 'fr', 'bg', ''].map((lang) => htmlLang(embedLang(`?lang=${lang}`, true)))).toEqual(['de-DE', 'en-US', 'fr-FR', 'en-US', 'en-US'])
  })
})
