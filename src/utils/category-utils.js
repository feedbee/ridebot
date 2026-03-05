/**
 * Utility functions for ride category validation, normalization and localization
 */
import { config } from '../config.js';
import { t } from '../i18n/index.js';

export const CATEGORY_CODES = {
  MIXED: 'mixed',
  ROAD: 'road',
  GRAVEL: 'gravel',
  MTB: 'mtb',
  MTB_XC: 'mtb-xc',
  E_BIKE: 'e-bike',
  VIRTUAL: 'virtual'
};

/**
 * List of valid ride category codes.
 */
export const VALID_CATEGORIES = Object.freeze(Object.values(CATEGORY_CODES));

/**
 * Default category to use when none is provided.
 */
export const DEFAULT_CATEGORY = CATEGORY_CODES.MIXED;

const CATEGORY_I18N_KEY_BY_CODE = Object.freeze({
  [CATEGORY_CODES.MIXED]: 'categories.regularMixed',
  [CATEGORY_CODES.ROAD]: 'categories.road',
  [CATEGORY_CODES.GRAVEL]: 'categories.gravel',
  [CATEGORY_CODES.MTB]: 'categories.mountainEnduroDownhill',
  [CATEGORY_CODES.MTB_XC]: 'categories.mtbXc',
  [CATEGORY_CODES.E_BIKE]: 'categories.eBike',
  [CATEGORY_CODES.VIRTUAL]: 'categories.virtualIndoor'
});

function normalizeText(input) {
  return String(input).trim().toLowerCase().replace(/\s+/g, ' ');
}

function isCode(value) {
  return VALID_CATEGORIES.includes(value);
}

/**
 * Normalize category input to a canonical category code.
 * Accepts only canonical codes.
 * @param {string} input
 * @returns {string}
 */
export function normalizeCategory(input) {
  if (!input || String(input).trim() === '') {
    return DEFAULT_CATEGORY;
  }

  const normalizedInput = normalizeText(input);
  if (isCode(normalizedInput)) {
    return normalizedInput;
  }

  return DEFAULT_CATEGORY;
}

/**
 * Get i18n key for category code. Falls back to default category key.
 * @param {string} category
 * @returns {string}
 */
export function getCategoryI18nKey(category) {
  const code = normalizeCategory(category);
  return CATEGORY_I18N_KEY_BY_CODE[code] || CATEGORY_I18N_KEY_BY_CODE[DEFAULT_CATEGORY];
}

/**
 * Render category label for a given language using i18n.
 * @param {string} category
 * @param {string} [language]
 * @returns {string}
 */
export function getCategoryLabel(category, language = config.i18n.defaultLanguage) {
  return t(language, getCategoryI18nKey(category), {}, {
    fallbackLanguage: config.i18n.fallbackLanguage,
    withMissingMarker: config.isDev
  });
}

/**
 * Validate if category is a supported canonical code.
 * @param {string} category
 * @returns {boolean}
 */
export function isValidCategory(category) {
  if (!category || String(category).trim() === '') return false;
  return isCode(normalizeText(category));
}
