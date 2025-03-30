/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { escapeHtml, escapeRideHtml } from '../../utils/html-escape.js';

describe('HTML Escape Utils', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<div class="test">Hello & "world" \'test\'</div>';
      const expected = '&lt;div class=&quot;test&quot;&gt;Hello &amp; &quot;world&quot; &#039;test&#039;&lt;/div&gt;';
      
      expect(escapeHtml(input)).toBe(expected);
    });
    
    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
    });
    
    it('should handle null and undefined', () => {
      expect(escapeHtml(null)).toBe(null);
      expect(escapeHtml(undefined)).toBe(undefined);
    });
    
    it('should handle strings without special characters', () => {
      const input = 'Hello world';
      expect(escapeHtml(input)).toBe(input);
    });
    
    it('should escape each special character correctly', () => {
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
      expect(escapeHtml('"')).toBe('&quot;');
      expect(escapeHtml('\'')).toBe('&#039;');
    });
  });
  
  describe('escapeRideHtml', () => {
    it('should escape HTML in ride title and meetingPoint', () => {
      const ride = {
        id: '123',
        title: '<b>Test</b> & Ride',
        meetingPoint: 'Meet at "Park" & <Square>',
        routeLink: 'https://example.com',
        date: new Date()
      };
      
      const escaped = escapeRideHtml(ride);
      
      expect(escaped.title).toBe('&lt;b&gt;Test&lt;/b&gt; &amp; Ride');
      expect(escaped.meetingPoint).toBe('Meet at &quot;Park&quot; &amp; &lt;Square&gt;');
      expect(escaped.routeLink).toBe(ride.routeLink); // Should not be escaped
      expect(escaped.id).toBe(ride.id); // Should not be escaped
      expect(escaped.date).toBe(ride.date); // Should not be escaped
    });
    
    it('should handle missing title and meetingPoint', () => {
      const ride = {
        id: '123',
        routeLink: 'https://example.com',
        date: new Date()
      };
      
      const escaped = escapeRideHtml(ride);
      
      expect(escaped.title).toBeUndefined();
      expect(escaped.meetingPoint).toBeUndefined();
      expect(escaped.routeLink).toBe(ride.routeLink);
    });
    
    it('should handle null ride', () => {
      expect(escapeRideHtml(null)).toBe(null);
    });
    
    it('should not modify the original ride object', () => {
      const ride = {
        title: '<b>Test</b>',
        meetingPoint: '"Park"'
      };
      
      const escaped = escapeRideHtml(ride);
      
      expect(escaped).not.toBe(ride); // Should be a new object
      expect(ride.title).toBe('<b>Test</b>'); // Original should be unchanged
      expect(ride.meetingPoint).toBe('"Park"'); // Original should be unchanged
    });
  });
});
