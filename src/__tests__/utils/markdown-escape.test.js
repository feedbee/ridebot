/**
 * @jest-environment node
 */

import { escapeMarkdown, escapeRideMarkdown } from '../../utils/markdown-escape.js';

describe('escapeMarkdown', () => {
  it('should escape special Markdown characters', () => {
    const input = '_italic_ *bold* [link](url) ~strike~ `code` > quote # heading + list - list = equals |table {curly} !image';
    const expected = '\\_italic\\_ \\*bold\\* \\[link\\]\\(url\\) \\~strike\\~ \\`code\\` \\> quote \\# heading \\+ list \\- list \\= equals \\|table \\{curly\\} \\!image';
    expect(escapeMarkdown(input)).toBe(expected);
  });

  it('should handle empty string', () => {
    expect(escapeMarkdown('')).toBe('');
  });

  it('should handle null input', () => {
    expect(escapeMarkdown(null)).toBeNull();
  });

  it('should handle undefined input', () => {
    expect(escapeMarkdown(undefined)).toBeUndefined();
  });

  it('should handle text without special characters', () => {
    const input = 'Just a normal text';
    expect(escapeMarkdown(input)).toBe(input);
  });

  it('should escape multiple occurrences of the same character', () => {
    const input = '**bold** __italic__';
    const expected = '\\*\\*bold\\*\\* \\_\\_italic\\_\\_';
    expect(escapeMarkdown(input)).toBe(expected);
  });
});

describe('escapeRideMarkdown', () => {
  it('should escape markdown in all relevant ride fields', () => {
    const ride = {
      title: '*Important* Ride',
      meetingPoint: '_Central_ Park',
      routeLink: '[Route](http://example.com)',
      otherField: '*should not escape*'  // Fields not specified should remain unchanged
    };

    const escaped = escapeRideMarkdown(ride);
    
    expect(escaped.title).toBe('\\*Important\\* Ride');
    expect(escaped.meetingPoint).toBe('\\_Central\\_ Park');
    expect(escaped.routeLink).toBe('\\[Route\\]\\(http://example\\.com\\)');
    expect(escaped.otherField).toBe('*should not escape*');
  });

  it('should handle null values in ride fields', () => {
    const ride = {
      title: '*Title*',
      meetingPoint: null,
      routeLink: null
    };

    const escaped = escapeRideMarkdown(ride);
    
    expect(escaped.title).toBe('\\*Title\\*');
    expect(escaped.meetingPoint).toBeNull();
    expect(escaped.routeLink).toBeNull();
  });

  it('should handle undefined values in ride fields', () => {
    const ride = {
      title: '*Title*',
      meetingPoint: undefined,
      routeLink: undefined
    };

    const escaped = escapeRideMarkdown(ride);
    
    expect(escaped.title).toBe('\\*Title\\*');
    expect(escaped.meetingPoint).toBeUndefined();
    expect(escaped.routeLink).toBeUndefined();
  });

  it('should handle null ride object', () => {
    expect(escapeRideMarkdown(null)).toBeNull();
  });

  it('should handle undefined ride object', () => {
    expect(escapeRideMarkdown(undefined)).toBeUndefined();
  });

  it('should preserve other ride properties', () => {
    const ride = {
      title: '*Title*',
      meetingPoint: '_Location_',
      routeLink: '[Link](url)',
      date: new Date('2024-03-15'),
      participants: ['Alice', 'Bob'],
      maxParticipants: 10
    };

    const escaped = escapeRideMarkdown(ride);
    
    expect(escaped.date).toEqual(ride.date);
    expect(escaped.participants).toEqual(ride.participants);
    expect(escaped.maxParticipants).toBe(10);
  });
}); 
