import { describe, it, expect } from 'vitest';
import { LANGS, defaultLanguage, keysOf, parseLanguage, t } from '../src/shared/i18n';

describe('i18n tables', () => {
  it('every key exists in both languages with non-empty text', () => {
    const keys = keysOf();
    expect(keys.length).toBeGreaterThan(40);
    for (const lang of LANGS) for (const k of keys) expect(t(lang, k).length, `${lang}:${k}`).toBeGreaterThan(0);
  });
  it('german and english differ for the main card strings', () => {
    expect(t('de', 'card.allow')).toBe('Erlauben');
    expect(t('en', 'card.allow')).toBe('Allow');
  });
  it('replaces params (all occurrences) and leaves unknown placeholders untouched', () => {
    expect(t('de', 'card.more', { n: 3 })).toBe('+3 weitere warten');
    expect(t('en', 'card.wants', { who: 'Reviewer', tool: 'Bash' })).toBe('Reviewer wants to use Bash');
    expect(t('en', 'card.wants', { who: 'A' })).toContain('{tool}');
  });
  it('parameter placeholders of both languages match', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of keysOf()) expect(ph(t('de', k)), k).toBe(ph(t('en', k)));
  });
});

describe('language selection', () => {
  it('parses only de/en', () => {
    expect(parseLanguage('de')).toBe('de');
    expect(parseLanguage('en')).toBe('en');
    expect(parseLanguage('fr')).toBeUndefined();
    expect(parseLanguage(5)).toBeUndefined();
  });
  it('defaults by system locale: de* -> de, everything else -> en', () => {
    expect(defaultLanguage('de-DE')).toBe('de');
    expect(defaultLanguage('de')).toBe('de');
    expect(defaultLanguage('en-US')).toBe('en');
    expect(defaultLanguage('')).toBe('en');
  });
});
