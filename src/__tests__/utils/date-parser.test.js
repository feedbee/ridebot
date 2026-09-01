/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DateParser } from '../../utils/date-parser.js';
import { config } from '../../config.js';

describe('DateParser', () => {
  // Save original config
  const originalTimezone = config.dateFormat.defaultTimezone;
  const originalProcessTimezone = process.env.TZ;
  
  afterEach(() => {
    jest.useRealTimers();
    process.env.TZ = originalProcessTimezone;
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

    it('should reject partially parsed date/time input', () => {
      const result = DateParser.parseDateTime('26.08 18:00', { language: 'ru' });
      expect(result).toBeNull();
    });

    it('should allow surrounding whitespace around fully parsed input', () => {
      const result = DateParser.parseDateTime('  March 15 2027 at 15:30  ', { language: 'en' });
      expect(result).not.toBeNull();
      expect(result.text).toBe('March 15 2027 at 15:30');
    });

    it.each([
      ['tomorrow', 'en'],
      ['March 15 2027', 'en'],
      ['tomorrow morning', 'en'],
      ['завтра', 'ru']
    ])('should reject input without an explicit time: %s', (input, language) => {
      const result = DateParser.parseDateTime(input, { language });
      expect(result).toBeNull();
    });

    it('should accept an explicit hour with implied zero minutes', () => {
      const result = DateParser.parseDateTime('tomorrow at 18', { language: 'en' });
      expect(result).not.toBeNull();
      expect(result.date.getHours()).toBe(18);
      expect(result.date.getMinutes()).toBe(0);
    });

    it('should parse Russian date input when language is explicitly Russian', () => {
      const now = new Date('2024-03-09T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const result = DateParser.parseDateTime('завтра в 14:00', { language: 'ru' });
      expect(result).not.toBeNull();
      expect(result.date.getDate()).toBe(10);
      expect(result.date.getHours()).toBe(14);
    });

    it('should parse Russian date input even when language is English', () => {
      const now = new Date('2024-03-09T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      const result = DateParser.parseDateTime('завтра в 14:00', { language: 'en' });
      expect(result).not.toBeNull();
      expect(result.date.getDate()).toBe(10);
      expect(result.date.getHours()).toBe(14);
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

    it.each(['UTC', 'Europe/Warsaw', 'America/New_York'])(
      'should parse the same Warsaw instant when the process timezone is %s',
      (processTimezone) => {
        process.env.TZ = processTimezone;
        config.dateFormat.defaultTimezone = 'Europe/Warsaw';

        const result = DateParser.parseDateTime('August 30 2026 at 10:00', { language: 'en' });

        expect(result.date.toISOString()).toBe('2026-08-30T08:00:00.000Z');
        expect(DateParser.formatDateTime(result.date, 'en').time).toBe('10:00');
      }
    );

    it.each([
      ['August 30 2026 at 10:00', '2026-08-30T08:00:00.000Z'],
      ['October 26 2026 at 10:00', '2026-10-26T09:00:00.000Z']
    ])('should apply the Warsaw offset in effect on the parsed date: %s', (input, expectedIso) => {
      process.env.TZ = 'America/New_York';
      config.dateFormat.defaultTimezone = 'Europe/Warsaw';

      const result = DateParser.parseDateTime(input, { language: 'en' });

      expect(result.date.toISOString()).toBe(expectedIso);
      expect(DateParser.formatDateTime(result.date, 'en').time).toBe('10:00');
    });

    it('should resolve relative dates from the current day in the configured timezone', () => {
      process.env.TZ = 'America/New_York';
      config.dateFormat.defaultTimezone = 'Europe/Warsaw';
      jest.useFakeTimers().setSystemTime(new Date('2026-08-26T22:30:00.000Z'));

      const result = DateParser.parseDateTime('tomorrow at 10:00', { language: 'en' });

      expect(result.date.toISOString()).toBe('2026-08-28T08:00:00.000Z');
    });

    it('should reject a local time that does not exist during the DST transition', () => {
      process.env.TZ = 'UTC';
      config.dateFormat.defaultTimezone = 'Europe/Warsaw';

      const result = DateParser.parseDateTime('March 28 2027 at 02:30', { language: 'en' });

      expect(result).toBeNull();
      expect(DateParser.parseDateTime('March 28 2027 at 01:30', { language: 'en' })).not.toBeNull();
      expect(DateParser.parseDateTime('March 28 2027 at 03:30', { language: 'en' })).not.toBeNull();
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

  describe('startOfDay', () => {
    it('returns midnight in the configured timezone', () => {
      process.env.TZ = 'America/New_York';
      config.dateFormat.defaultTimezone = 'Europe/Warsaw';

      const result = DateParser.startOfDay(new Date('2026-09-01T21:30:00.000Z'));

      expect(result.toISOString()).toBe('2026-08-31T22:00:00.000Z');
    });

    it('uses the process timezone when no timezone is configured', () => {
      process.env.TZ = 'Europe/Warsaw';
      config.dateFormat.defaultTimezone = null;

      const result = DateParser.startOfDay(new Date('2026-09-01T21:30:00.000Z'));

      expect(result.toISOString()).toBe('2026-08-31T22:00:00.000Z');
    });

    it('uses the offset in effect at midnight across a DST transition', () => {
      process.env.TZ = 'UTC';
      config.dateFormat.defaultTimezone = 'Europe/Warsaw';

      const result = DateParser.startOfDay(new Date('2027-03-28T12:00:00.000Z'));

      expect(result.toISOString()).toBe('2027-03-27T23:00:00.000Z');
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

    it('should resolve display locale from language', () => {
      expect(DateParser.getDisplayLocale('ru')).toBe('ru-RU');
      expect(DateParser.getDisplayLocale('ru-RU')).toBe('ru-RU');
      expect(DateParser.getDisplayLocale('en')).toBe('en-GB');
      expect(DateParser.getDisplayLocale('unknown')).toBe(config.dateFormat.locale);
    });

    it('should format chat titles using the configured timezone day', () => {
      process.env.TZ = 'America/New_York';
      config.dateFormat.defaultTimezone = 'Europe/Warsaw';
      const date = new Date('2026-08-27T22:30:00.000Z');

      expect(DateParser.formatDateForChatTitle(date, 'en')).toBe('August 28th');
      expect(DateParser.formatDateForChatTitle(date, 'ru')).toContain('28');
    });
  });
});
