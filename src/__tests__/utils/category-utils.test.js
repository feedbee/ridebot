/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { 
  VALID_CATEGORIES, 
  DEFAULT_CATEGORY, 
  normalizeCategory, 
  isValidCategory 
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
      expect(VALID_CATEGORIES).toContain('Regular/Mixed Ride');
      expect(VALID_CATEGORIES).toContain('Road Ride');
      expect(VALID_CATEGORIES).toContain('Gravel Ride');
      expect(VALID_CATEGORIES).toContain('Mountain/Enduro/Downhill Ride');
      expect(VALID_CATEGORIES).toContain('MTB-XC Ride');
      expect(VALID_CATEGORIES).toContain('E-Bike Ride');
      expect(VALID_CATEGORIES).toContain('Virtual/Indoor Ride');
    });
  });

  describe('normalizeCategory', () => {
    const testCases = [
      // Default cases
      { input: '', expected: DEFAULT_CATEGORY, description: 'empty string' },
      { input: '   ', expected: DEFAULT_CATEGORY, description: 'whitespace only' },
      { input: null, expected: DEFAULT_CATEGORY, description: 'null' },
      { input: undefined, expected: DEFAULT_CATEGORY, description: 'undefined' },
      
      // Case insensitive exact matches
      { input: 'Road Ride', expected: 'Road Ride', description: 'exact match' },
      { input: 'road ride', expected: 'Road Ride', description: 'lowercase' },
      { input: 'ROAD RIDE', expected: 'Road Ride', description: 'uppercase' },
      { input: 'RoAd RiDe', expected: 'Road Ride', description: 'mixed case' },
      
      // Partial matches
      { input: 'Road', expected: 'Road Ride', description: 'partial match' },
      { input: 'Gravel', expected: 'Gravel Ride', description: 'gravel partial' },
      { input: 'MTB-XC', expected: 'MTB-XC Ride', description: 'MTB-XC partial' },
      { input: 'Mountain', expected: 'Mountain/Enduro/Downhill Ride', description: 'mountain partial' },
      { input: 'Virtual', expected: 'Virtual/Indoor Ride', description: 'virtual partial' },
      
      // Whitespace handling
      { input: '  Road Ride  ', expected: 'Road Ride', description: 'trimmed whitespace' },
      { input: '\tRoad Ride\t', expected: 'Road Ride', description: 'trimmed tabs' },
      
      // Invalid inputs
      { input: 'InvalidCategory', expected: DEFAULT_CATEGORY, description: 'invalid input' },
      { input: 'xyz123', expected: DEFAULT_CATEGORY, description: 'random text' },
      { input: 'Road  Ride', expected: DEFAULT_CATEGORY, description: 'extra spaces' }
    ];

    testCases.forEach(({ input, expected, description }) => {
      it(`should handle ${description}`, () => {
        expect(normalizeCategory(input)).toBe(expected);
      });
    });
  });

  describe('isValidCategory', () => {
    const validCases = [
      'Road Ride',
      'road ride',
      'ROAD RIDE',
      'Road',
      'Gravel',
      'MTB-XC',
      'Mountain',
      'Virtual',
      '  Road Ride  '
    ];

    const invalidCases = [
      null,
      undefined,
      ''
    ];

    validCases.forEach(input => {
      it(`should return true for "${input}"`, () => {
        expect(isValidCategory(input)).toBe(true);
      });
    });

    invalidCases.forEach(input => {
      it(`should return false for ${input}`, () => {
        expect(isValidCategory(input)).toBe(false);
      });
    });

    it('should normalize invalid inputs to default category (which is valid)', () => {
      expect(isValidCategory('InvalidCategory')).toBe(true);
      expect(isValidCategory('xyz123')).toBe(true);
    });
  });
});
