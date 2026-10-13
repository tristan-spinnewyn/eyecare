import { describe, it, expect } from 'vitest';
import path from 'path';
import { I18n, SUPPORTED } from '../src/main/i18n.js';

describe('I18n', () => {
  const localesDir = path.resolve(__dirname, '../locales');
  const i18n = new I18n(localesDir);

  it('exposes supported languages list', () => {
    expect(SUPPORTED).toContain('fr');
    expect(SUPPORTED).toContain('en');
  });

  it('resolves system language correctly', () => {
    i18n.setLanguage('system', 'fr-FR');
    expect(i18n.getLanguage()).toBe('fr');

    i18n.setLanguage('system', 'en-US');
    expect(i18n.getLanguage()).toBe('en');

    i18n.setLanguage('system', 'de-DE');
    expect(i18n.getLanguage()).toBe('en');
  });

  it('loads explicit language codes', () => {
    i18n.setLanguage('fr', 'en');
    expect(i18n.getLanguage()).toBe('fr');
    expect(i18n.t('nav.dashboard')).toBe('Tableau de bord');

    i18n.setLanguage('en', 'fr');
    expect(i18n.getLanguage()).toBe('en');
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
  });

  it('formats templates with placeholders (%d, %s, %%, %.1f)', () => {
    i18n.setLanguage('en');
    expect(i18n.t('notif.work_done', 20.7)).toContain('20');
    expect(i18n.t('pdf.breaks_completed', 5, 10)).toContain('5');

    // Test array indexing and escape
    i18n._bundle.testArray = ['zero', 'one'];
    expect(i18n.t('testArray.1')).toBe('one');
    expect(i18n.t('testArray.99')).toBe('testArray.99');

    // Test fallback when key does not exist
    expect(i18n.t('non.existent.key')).toBe('non.existent.key');
    expect(i18n.t('non.existent.key', 'arg')).toBe('non.existent.key');
  });

  it('returns full bundle', () => {
    i18n.setLanguage('fr');
    const bundle = i18n.getBundle();
    expect(bundle).toBeDefined();
    expect(bundle.nav).toBeDefined();
  });

  it('throws when no locale bundle can be loaded', () => {
    const invalidI18n = new I18n('/non/existent/path');
    expect(() => invalidI18n.setLanguage('en')).toThrow(/No message bundle found/);
  });
});
