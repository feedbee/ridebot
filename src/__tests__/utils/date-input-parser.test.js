/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { parseDateTimeInput } from '../../utils/date-input-parser.js';

describe('parseDateTimeInput', () => {
  beforeEach(() => {
    const now = new Date('2024-03-09T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should successfully parse valid future dates', () => {
    const result = parseDateTimeInput('tomorrow at 2pm');
    expect(result.date).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  it('should reject past dates', () => {
    const result = parseDateTimeInput('yesterday at 2pm');
    expect(result.date).toBeNull();
    expect(result.error).toContain('can\'t be scheduled in the past');
  });

  it('should handle invalid date formats', () => {
    const result = parseDateTimeInput('not a valid date');
    expect(result.date).toBeNull();
    expect(result.error).toContain('couldn\'t understand that date/time format');
  });
}); 
