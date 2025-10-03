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
    describe('default cases', () => {
      it('should return default category for empty string', () => {
        expect(normalizeCategory('')).toBe(DEFAULT_CATEGORY);
      });

      it('should return default category for whitespace only', () => {
        expect(normalizeCategory('   ')).toBe(DEFAULT_CATEGORY);
      });

      it('should return default category for null', () => {
        expect(normalizeCategory(null)).toBe(DEFAULT_CATEGORY);
      });

      it('should return default category for undefined', () => {
        expect(normalizeCategory(undefined)).toBe(DEFAULT_CATEGORY);
      });
    });

    describe('exact matches (case insensitive)', () => {
      it('should match "Road Ride" exactly', () => {
        expect(normalizeCategory('Road Ride')).toBe('Road Ride');
      });

      it('should match "road ride" (lowercase)', () => {
        expect(normalizeCategory('road ride')).toBe('Road Ride');
      });

      it('should match "ROAD RIDE" (uppercase)', () => {
        expect(normalizeCategory('ROAD RIDE')).toBe('Road Ride');
      });

      it('should match "Gravel Ride" exactly', () => {
        expect(normalizeCategory('Gravel Ride')).toBe('Gravel Ride');
      });

      it('should match "gravel ride" (lowercase)', () => {
        expect(normalizeCategory('gravel ride')).toBe('Gravel Ride');
      });

      it('should match "Mountain/Enduro/Downhill Ride" exactly', () => {
        expect(normalizeCategory('Mountain/Enduro/Downhill Ride')).toBe('Mountain/Enduro/Downhill Ride');
      });

      it('should match "MTB-XC Ride" exactly', () => {
        expect(normalizeCategory('MTB-XC Ride')).toBe('MTB-XC Ride');
      });

      it('should match "mtb-xc ride" (lowercase)', () => {
        expect(normalizeCategory('mtb-xc ride')).toBe('MTB-XC Ride');
      });

      it('should match "E-Bike Ride" exactly', () => {
        expect(normalizeCategory('E-Bike Ride')).toBe('E-Bike Ride');
      });

      it('should match "e-bike ride" (lowercase)', () => {
        expect(normalizeCategory('e-bike ride')).toBe('E-Bike Ride');
      });

      it('should match "Virtual/Indoor Ride" exactly', () => {
        expect(normalizeCategory('Virtual/Indoor Ride')).toBe('Virtual/Indoor Ride');
      });

      it('should match "Regular/Mixed Ride" exactly', () => {
        expect(normalizeCategory('Regular/Mixed Ride')).toBe('Regular/Mixed Ride');
      });
    });

    describe('partial matches without "ride" word', () => {
      it('should match "Road" to "Road Ride"', () => {
        expect(normalizeCategory('Road')).toBe('Road Ride');
      });

      it('should match "road" (lowercase) to "Road Ride"', () => {
        expect(normalizeCategory('road')).toBe('Road Ride');
      });

      it('should match "Gravel" to "Gravel Ride"', () => {
        expect(normalizeCategory('Gravel')).toBe('Gravel Ride');
      });

      it('should match "gravel" (lowercase) to "Gravel Ride"', () => {
        expect(normalizeCategory('gravel')).toBe('Gravel Ride');
      });

      it('should match "MTB-XC" to "MTB-XC Ride"', () => {
        expect(normalizeCategory('MTB-XC')).toBe('MTB-XC Ride');
      });

      it('should match "E-Bike" to "E-Bike Ride"', () => {
        expect(normalizeCategory('E-Bike')).toBe('E-Bike Ride');
      });

      it('should match "e-bike" (lowercase) to "E-Bike Ride"', () => {
        expect(normalizeCategory('e-bike')).toBe('E-Bike Ride');
      });
    });

    describe('slash-separated partial matches', () => {
      it('should match "Mountain" to "Mountain/Enduro/Downhill Ride"', () => {
        expect(normalizeCategory('Mountain')).toBe('Mountain/Enduro/Downhill Ride');
      });

      it('should match "Enduro" to "Mountain/Enduro/Downhill Ride"', () => {
        expect(normalizeCategory('Enduro')).toBe('Mountain/Enduro/Downhill Ride');
      });

      it('should match "Downhill" to "Mountain/Enduro/Downhill Ride"', () => {
        expect(normalizeCategory('Downhill')).toBe('Mountain/Enduro/Downhill Ride');
      });

      it('should match "mountain" (lowercase) to "Mountain/Enduro/Downhill Ride"', () => {
        expect(normalizeCategory('mountain')).toBe('Mountain/Enduro/Downhill Ride');
      });

      it('should match "enduro" (lowercase) to "Mountain/Enduro/Downhill Ride"', () => {
        expect(normalizeCategory('enduro')).toBe('Mountain/Enduro/Downhill Ride');
      });

      it('should match "downhill" (lowercase) to "Mountain/Enduro/Downhill Ride"', () => {
        expect(normalizeCategory('downhill')).toBe('Mountain/Enduro/Downhill Ride');
      });

      it('should match "Virtual" to "Virtual/Indoor Ride"', () => {
        expect(normalizeCategory('Virtual')).toBe('Virtual/Indoor Ride');
      });

      it('should match "Indoor" to "Virtual/Indoor Ride"', () => {
        expect(normalizeCategory('Indoor')).toBe('Virtual/Indoor Ride');
      });

      it('should match "virtual" (lowercase) to "Virtual/Indoor Ride"', () => {
        expect(normalizeCategory('virtual')).toBe('Virtual/Indoor Ride');
      });

      it('should match "indoor" (lowercase) to "Virtual/Indoor Ride"', () => {
        expect(normalizeCategory('indoor')).toBe('Virtual/Indoor Ride');
      });

      it('should match "Regular" to "Regular/Mixed Ride"', () => {
        expect(normalizeCategory('Regular')).toBe('Regular/Mixed Ride');
      });

      it('should match "Mixed" to "Regular/Mixed Ride"', () => {
        expect(normalizeCategory('Mixed')).toBe('Regular/Mixed Ride');
      });

      it('should match "regular" (lowercase) to "Regular/Mixed Ride"', () => {
        expect(normalizeCategory('regular')).toBe('Regular/Mixed Ride');
      });

      it('should match "mixed" (lowercase) to "Regular/Mixed Ride"', () => {
        expect(normalizeCategory('mixed')).toBe('Regular/Mixed Ride');
      });
    });

    describe('whitespace handling', () => {
      it('should trim leading whitespace', () => {
        expect(normalizeCategory('  Road Ride')).toBe('Road Ride');
      });

      it('should trim trailing whitespace', () => {
        expect(normalizeCategory('Road Ride  ')).toBe('Road Ride');
      });

      it('should trim both leading and trailing whitespace', () => {
        expect(normalizeCategory('  Road Ride  ')).toBe('Road Ride');
      });

      it('should handle tabs', () => {
        expect(normalizeCategory('\tRoad Ride\t')).toBe('Road Ride');
      });
    });

    describe('invalid inputs', () => {
      it('should return default category for completely invalid input', () => {
        expect(normalizeCategory('InvalidCategory')).toBe(DEFAULT_CATEGORY);
      });

      it('should return default category for random text', () => {
        expect(normalizeCategory('xyz123')).toBe(DEFAULT_CATEGORY);
      });

      it('should return default category for numbers', () => {
        expect(normalizeCategory('12345')).toBe(DEFAULT_CATEGORY);
      });

      it('should return default category for special characters only', () => {
        expect(normalizeCategory('!@#$%')).toBe(DEFAULT_CATEGORY);
      });
    });

    describe('edge cases', () => {
      it('should not handle input with extra spaces between words (falls back to default)', () => {
        // The normalizeCategory doesn't handle extra spaces within the string
        // It will fall back to default category as it won't find an exact match
        expect(normalizeCategory('Road  Ride')).toBe(DEFAULT_CATEGORY);
      });

      it('should handle mixed case input', () => {
        expect(normalizeCategory('RoAd RiDe')).toBe('Road Ride');
      });

      it('should handle input with "ride" in it', () => {
        expect(normalizeCategory('road ride')).toBe('Road Ride');
      });
    });
  });

  describe('isValidCategory', () => {
    describe('valid categories', () => {
      it('should return true for "Road Ride"', () => {
        expect(isValidCategory('Road Ride')).toBe(true);
      });

      it('should return true for "Gravel Ride"', () => {
        expect(isValidCategory('Gravel Ride')).toBe(true);
      });

      it('should return true for "Mountain/Enduro/Downhill Ride"', () => {
        expect(isValidCategory('Mountain/Enduro/Downhill Ride')).toBe(true);
      });

      it('should return true for "MTB-XC Ride"', () => {
        expect(isValidCategory('MTB-XC Ride')).toBe(true);
      });

      it('should return true for "E-Bike Ride"', () => {
        expect(isValidCategory('E-Bike Ride')).toBe(true);
      });

      it('should return true for "Virtual/Indoor Ride"', () => {
        expect(isValidCategory('Virtual/Indoor Ride')).toBe(true);
      });

      it('should return true for "Regular/Mixed Ride"', () => {
        expect(isValidCategory('Regular/Mixed Ride')).toBe(true);
      });
    });

    describe('case insensitive matching', () => {
      it('should return true for "road ride" (lowercase)', () => {
        expect(isValidCategory('road ride')).toBe(true);
      });

      it('should return true for "ROAD RIDE" (uppercase)', () => {
        expect(isValidCategory('ROAD RIDE')).toBe(true);
      });
    });

    describe('partial matches', () => {
      it('should return true for "Road" (normalizes to "Road Ride")', () => {
        expect(isValidCategory('Road')).toBe(true);
      });

      it('should return true for "Gravel" (normalizes to "Gravel Ride")', () => {
        expect(isValidCategory('Gravel')).toBe(true);
      });

      it('should return true for "Mountain" (normalizes to "Mountain/Enduro/Downhill Ride")', () => {
        expect(isValidCategory('Mountain')).toBe(true);
      });

      it('should return true for "Virtual" (normalizes to "Virtual/Indoor Ride")', () => {
        expect(isValidCategory('Virtual')).toBe(true);
      });
    });

    describe('invalid categories', () => {
      it('should return false for null', () => {
        expect(isValidCategory(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isValidCategory(undefined)).toBe(false);
      });

      it('should return false for empty string', () => {
        expect(isValidCategory('')).toBe(false);
      });

      it('should return true for invalid category name (normalizes to default)', () => {
        // isValidCategory normalizes the input, and invalid inputs normalize to default category
        // which is a valid category, so this returns true
        expect(isValidCategory('InvalidCategory')).toBe(true);
      });

      it('should return true for random text (normalizes to default)', () => {
        // isValidCategory normalizes the input, and invalid inputs normalize to default category
        // which is a valid category, so this returns true
        expect(isValidCategory('xyz123')).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should return true for category with whitespace', () => {
        expect(isValidCategory('  Road Ride  ')).toBe(true);
      });

      it('should validate normalized result is in VALID_CATEGORIES', () => {
        // This tests that isValidCategory uses normalizeCategory correctly
        const result = isValidCategory('road');
        expect(result).toBe(true);
      });
    });
  });
});

