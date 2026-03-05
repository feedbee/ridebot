/**
 * @jest-environment node
 */
import { createTranslator, getLocale, resolveLanguage, t } from '../../i18n/index.js';

describe('i18n', () => {
  describe('resolveLanguage', () => {
    it('should return fallback for empty language', () => {
      expect(resolveLanguage('', 'en')).toBe('en');
    });

    it('should normalize locale tag and keep base language', () => {
      expect(resolveLanguage('ru-RU', 'en')).toBe('ru');
    });

    it('should fallback for unknown language', () => {
      expect(resolveLanguage('de', 'en')).toBe('en');
    });
  });

  describe('t', () => {
    it('should return localized value by key', () => {
      expect(t('en', 'common.yes')).toBe('Yes');
      expect(t('ru', 'common.yes')).toBe('Да');
    });

    it('should interpolate params', () => {
      expect(t('en', 'common.greeting', { name: 'Alex' })).toBe('Hello, Alex!');
      expect(t('ru', 'common.greeting', { name: 'Alex' })).toBe('Привет, Alex!');
    });

    it('should fallback to fallback language when selected language is unknown', () => {
      expect(t('de', 'common.yes', {}, { fallbackLanguage: 'en' })).toBe('Yes');
    });

    it('should return missing marker for unknown key by default', () => {
      expect(t('en', 'unknown.path')).toBe('[[unknown.path]]');
    });

    it('should return raw key when missing marker is disabled', () => {
      expect(t('en', 'unknown.path', {}, { withMissingMarker: false })).toBe('unknown.path');
    });
  });

  describe('createTranslator', () => {
    it('should create pre-bound translator', () => {
      const tr = createTranslator('en', { fallbackLanguage: 'en' });
      expect(tr('common.greeting', { name: 'Sam' })).toBe('Hello, Sam!');
    });
  });

  describe('getLocale', () => {
    it('should return locale object', () => {
      const locale = getLocale('ru', 'en');
      expect(locale).toBeDefined();
      expect(locale.common.yes).toBe('Да');
    });
  });
});
