/**
 * @jest-environment node
 */
import {
  CATEGORY_CODES,
  VALID_CATEGORIES,
  DEFAULT_CATEGORY,
  normalizeCategory,
  isValidCategory,
  getCategoryLabel
} from '../../utils/category-utils.js';

describe('category-utils', () => {
  describe('Constants', () => {
    it('should export VALID_CATEGORIES array', () => {
      expect(VALID_CATEGORIES).toBeDefined();
      expect(Array.isArray(VALID_CATEGORIES)).toBe(true);
      expect(VALID_CATEGORIES.length).toBeGreaterThan(0);
    });

    it('should export DEFAULT_CATEGORY', () => {
      expect(DEFAULT_CATEGORY).toBeDefined();
      expect(typeof DEFAULT_CATEGORY).toBe('string');
      expect(VALID_CATEGORIES).toContain(DEFAULT_CATEGORY);
    });

    it('should have expected categories', () => {
      expect(VALID_CATEGORIES).toContain(CATEGORY_CODES.MIXED);
      expect(VALID_CATEGORIES).toContain(CATEGORY_CODES.ROAD);
      expect(VALID_CATEGORIES).toContain(CATEGORY_CODES.GRAVEL);
      expect(VALID_CATEGORIES).toContain(CATEGORY_CODES.MTB);
      expect(VALID_CATEGORIES).toContain(CATEGORY_CODES.MTB_XC);
      expect(VALID_CATEGORIES).toContain(CATEGORY_CODES.E_BIKE);
      expect(VALID_CATEGORIES).toContain(CATEGORY_CODES.VIRTUAL);
    });
  });

  describe('normalizeCategory', () => {
    const testCases = [
      { input: '', expected: DEFAULT_CATEGORY, description: 'empty string' },
      { input: '   ', expected: DEFAULT_CATEGORY, description: 'whitespace only' },
      { input: null, expected: DEFAULT_CATEGORY, description: 'null' },
      { input: undefined, expected: DEFAULT_CATEGORY, description: 'undefined' },

      { input: 'road', expected: CATEGORY_CODES.ROAD, description: 'canonical code' },
      { input: 'ROAD', expected: CATEGORY_CODES.ROAD, description: 'canonical uppercase' },
      { input: '  mtb-xc  ', expected: CATEGORY_CODES.MTB_XC, description: 'canonical with whitespace' },
      { input: 'E-BIKE', expected: CATEGORY_CODES.E_BIKE, description: 'canonical e-bike uppercase' },

      { input: 'Road Ride', expected: DEFAULT_CATEGORY, description: 'legacy EN label is not supported' },
      { input: 'Шоссе', expected: DEFAULT_CATEGORY, description: 'localized label is not supported' },
      { input: 'virtual_indoor', expected: DEFAULT_CATEGORY, description: 'legacy code is not supported' },
      { input: 'xyz123', expected: DEFAULT_CATEGORY, description: 'random text' }
    ];

    testCases.forEach(({ input, expected, description }) => {
      it(`should handle ${description}`, () => {
        expect(normalizeCategory(input)).toBe(expected);
      });
    });
  });

  describe('isValidCategory', () => {
    const validCases = [
      'road',
      'ROAD',
      'gravel',
      'mtb',
      'mtb-xc',
      'e-bike',
      'virtual',
      '  mixed  '
    ];

    const invalidCases = [
      null,
      undefined,
      '',
      'Road Ride',
      'Шоссе',
      'regular_mixed',
      'virtual_indoor',
      'invalid'
    ];

    validCases.forEach(input => {
      it(`should return true for "${input}"`, () => {
        expect(isValidCategory(input)).toBe(true);
      });
    });

    invalidCases.forEach(input => {
      it(`should return false for ${input}` , () => {
        expect(isValidCategory(input)).toBe(false);
      });
    });
  });

  describe('getCategoryLabel', () => {
    it('should render EN labels for category code', () => {
      expect(getCategoryLabel(CATEGORY_CODES.ROAD, 'en')).toBe('Road Ride');
    });

    it('should render RU labels for category code', () => {
      expect(getCategoryLabel(CATEGORY_CODES.ROAD, 'ru')).toBe('Шоссе');
    });

    it('should fallback to default category label for unknown value', () => {
      expect(getCategoryLabel('Road Ride', 'ru')).toBe('Смешанная поездка');
    });
  });
});
