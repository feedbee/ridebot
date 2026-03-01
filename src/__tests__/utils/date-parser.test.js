/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DateParser } from '../../utils/date-parser.js';
import { config } from '../../config.js';

describe('DateParser', () => {
  // Save original config
  const originalTimezone = config.dateFormat.defaultTimezone;
  
  afterEach(() => {
    jest.useRealTimers();
  });

  // Restore original config after all tests
  afterAll(() => {
    config.dateFormat.defaultTimezone = originalTimezone;
  });
  
  describe('parseDateTime without timezone', () => {
    beforeEach(() => {
      // Ensure no timezone is set for these tests
      config.dateFormat.defaultTimezone = null;
    });
    
    it('should parse relative dates correctly', () => {
      const now = new Date('2024-03-09T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const result = DateParser.parseDateTime('tomorrow at 2pm');
      expect(result).not.toBeNull();
      expect(result.date.getDate()).toBe(10); // tomorrow's date in local timezone
      expect(result.date.getHours()).toBe(14); // 2pm in local timezone
    });

    it('should parse absolute dates correctly', () => {
      const result = DateParser.parseDateTime('March 15 2024 at 15:30');
      expect(result).not.toBeNull();
      const formatted = DateParser.formatDateTime(result.date);
      expect(formatted.time).toBe('15:30');
      expect(formatted.date).toContain('15');
      expect(formatted.date).toContain('2024');
    });

    it('should return null for invalid date formats', () => {
      const result = DateParser.parseDateTime('not a valid date');
      expect(result).toBeNull();
    });
  });
  
  describe('parseDateTime with timezone', () => {
    beforeEach(() => {
      // Set a specific timezone for these tests
      config.dateFormat.defaultTimezone = 'Europe/London';
    });
    
    it('should parse relative dates correctly with timezone', () => {
      const now = new Date('2024-03-09T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const result = DateParser.parseDateTime('tomorrow at 2pm');
      expect(result).not.toBeNull();
      const formatted = DateParser.formatDateTime(result.date);
      expect(formatted.time).toBe('14:00');
      expect(formatted.date).toContain('10');
    });
    
    it('should parse absolute dates correctly with timezone', () => {
      const result = DateParser.parseDateTime('March 15 2024 at 15:30');
      expect(result).not.toBeNull();
      const formatted = DateParser.formatDateTime(result.date);
      expect(formatted.time).toBe('15:30');
      expect(formatted.date).toContain('15');
      expect(formatted.date).toContain('2024');
    });
    
    it('should return null for invalid date formats with timezone', () => {
      const result = DateParser.parseDateTime('not a valid date');
      expect(result).toBeNull();
    });
  });

  describe('isPast', () => {
    it('should correctly identify past dates', () => {
      const now = new Date('2024-03-09T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const pastDate = new Date('2024-03-09T11:00:00Z');
      const futureDate = new Date('2024-03-09T13:00:00Z');

      expect(DateParser.isPast(pastDate)).toBe(true);
      expect(DateParser.isPast(futureDate)).toBe(false);
    });
  });

  describe('formatDateTime', () => {
    it('should format date and time according to config', () => {
      const date = new Date('2024-03-15T15:30:00Z');
      const formatted = DateParser.formatDateTime(date);
      
      expect(formatted).toHaveProperty('date');
      expect(formatted).toHaveProperty('time');
      expect(typeof formatted.date).toBe('string');
      expect(typeof formatted.time).toBe('string');
    });
  });
}); 
