/**
 * @jest-environment node
 */

import { parseDuration } from '../../utils/duration-parser.js';

describe('parseDuration', () => {
  it('should parse plain minutes', () => {
    const result = parseDuration('90');
    expect(result.duration).toBe(90);
    expect(result.error).toBeUndefined();
  });

  it('should parse hours only', () => {
    expect(parseDuration('2h').duration).toBe(120);
    expect(parseDuration('2 h').duration).toBe(120);
    expect(parseDuration('2 hours').duration).toBe(120);
    expect(parseDuration('2.5h').duration).toBe(150);
    expect(parseDuration('2.5 hours').duration).toBe(150);
  });

  it('should parse minutes only', () => {
    expect(parseDuration('30m').duration).toBe(30);
    expect(parseDuration('30 m').duration).toBe(30);
    expect(parseDuration('30 min').duration).toBe(30);
    expect(parseDuration('30 minutes').duration).toBe(30);
  });

  it('should parse hours and minutes', () => {
    expect(parseDuration('2h 30m').duration).toBe(150);
    expect(parseDuration('2 hours 30 minutes').duration).toBe(150);
    expect(parseDuration('1h 15m').duration).toBe(75);
  });

  it('should handle whitespace and case variations', () => {
    expect(parseDuration('  2h  30m  ').duration).toBe(150);
    expect(parseDuration('2H 30M').duration).toBe(150);
    expect(parseDuration('2 HOURS 30 MINUTES').duration).toBe(150);
  });

  it('should handle invalid formats', () => {
    const result = parseDuration('invalid');
    expect(result.duration).toBeNull();
    expect(result.error).toContain('couldn\'t understand that duration format');
  });
}); 
