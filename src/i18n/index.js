import { en } from './locales/en.js';
import { ru } from './locales/ru.js';

const locales = {
  en,
  ru
};

function getNestedValue(obj, key) {
  return key.split('.').reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, obj);
}

function interpolate(template, params = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      return String(params[name]);
    }
    return match;
  });
}

export function resolveLanguage(language, fallbackLanguage = 'en') {
  if (typeof language !== 'string' || language.trim() === '') {
    return fallbackLanguage;
  }

  const normalized = language.toLowerCase();
  if (locales[normalized]) return normalized;

  const baseLanguage = normalized.split('-')[0];
  if (locales[baseLanguage]) return baseLanguage;

  return fallbackLanguage;
}

export function getLocale(language, fallbackLanguage = 'en') {
  const resolved = resolveLanguage(language, fallbackLanguage);
  return locales[resolved] || locales[fallbackLanguage] || locales.en;
}

export function t(language, key, params = {}, options = {}) {
  const fallbackLanguage = options.fallbackLanguage || 'en';
  const withMissingMarker = options.withMissingMarker !== false;

  const locale = getLocale(language, fallbackLanguage);
  const fallbackLocale = getLocale(fallbackLanguage, 'en');

  let value = getNestedValue(locale, key);
  if (value === undefined) {
    value = getNestedValue(fallbackLocale, key);
  }

  if (value === undefined) {
    return withMissingMarker ? `[[${key}]]` : key;
  }

  return interpolate(value, params);
}

export function createTranslator(language, options = {}) {
  return (key, params = {}) => t(language, key, params, options);
}

