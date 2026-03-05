/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { parseDateTimeInput } from '../../utils/date-input-parser.js';
import { t } from '../../i18n/index.js';

describe('parseDateTimeInput', () => {
  const tr = (language, key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

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

  it('should parse valid Russian future dates', () => {
    const result = parseDateTimeInput('завтра в 14:00', { language: 'ru' });
    expect(result.date).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  it('should parse Russian date input even when interface language is English', () => {
    const result = parseDateTimeInput('завтра в 14:00', { language: 'en' });
    expect(result.date).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  it('should parse English date input even when interface language is Russian', () => {
    const result = parseDateTimeInput('tomorrow at 2pm', { language: 'ru' });
    expect(result.date).not.toBeNull();
    expect(result.error).toBeUndefined();
  });

  it.each(['en', 'ru'])('should reject past dates (%s)', (language) => {
    const input = language === 'ru' ? 'вчера в 14:00' : 'yesterday at 2pm';
    const result = parseDateTimeInput(input, { language });
    expect(result.date).toBeNull();
    expect(result.error).toContain(tr(language, 'parsers.date.pastDate'));
  });

  it.each(['en', 'ru'])('should handle invalid date formats (%s)', (language) => {
    const result = parseDateTimeInput('not a valid date', { language });
    expect(result.date).toBeNull();
    expect(result.error).toContain(tr(language, 'parsers.date.invalidFormat'));
  });
}); 
