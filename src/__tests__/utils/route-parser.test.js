import { RouteParser } from '../../utils/route-parser.js';
import * as cheerio from 'cheerio';

describe('RouteParser', () => {
  describe('isValidRouteUrl', () => {
    test('should return true for valid URLs', () => {
      expect(RouteParser.isValidRouteUrl('https://www.strava.com/routes/123456')).toBe(true);
      expect(RouteParser.isValidRouteUrl('http://ridewithgps.com/routes/789')).toBe(true);
      expect(RouteParser.isValidRouteUrl('https://www.komoot.com/tour/12345')).toBe(true);
    });

    test('should return false for invalid URLs', () => {
      expect(RouteParser.isValidRouteUrl('not-a-url')).toBe(false);
      expect(RouteParser.isValidRouteUrl('strava.com')).toBe(false);
      expect(RouteParser.isValidRouteUrl('')).toBe(false);
    });
  });

  describe('isKnownProvider', () => {
    test('should return true for supported providers', () => {
      expect(RouteParser.isKnownProvider('https://www.strava.com/routes/123456')).toBe(true);
      expect(RouteParser.isKnownProvider('https://www.strava.com/activities/123456')).toBe(true);
      expect(RouteParser.isKnownProvider('http://ridewithgps.com/routes/789')).toBe(true);
      expect(RouteParser.isKnownProvider('https://www.komoot.com/tour/12345')).toBe(true);
    });

    test('should return false for unsupported providers', () => {
      expect(RouteParser.isKnownProvider('https://example.com/route/123')).toBe(false);
      expect(RouteParser.isKnownProvider('https://strava.com/invalid/123')).toBe(false);
    });
  });

  describe('getRouteProvider', () => {
    test('should correctly identify providers', () => {
      expect(RouteParser.getRouteProvider('https://www.strava.com/routes/123456')).toBe('strava');
      expect(RouteParser.getRouteProvider('https://www.strava.com/activities/123456')).toBe('strava');
      expect(RouteParser.getRouteProvider('http://ridewithgps.com/routes/789')).toBe('ridewithgps');
      expect(RouteParser.getRouteProvider('https://www.komoot.com/tour/12345')).toBe('komoot');
    });

    test('should return null for unknown providers', () => {
      expect(RouteParser.getRouteProvider('https://example.com/route/123')).toBeNull();
    });
  });

  describe('getRouteId', () => {
    test('should extract route ID from valid URLs', () => {
      expect(RouteParser.getRouteId('https://www.strava.com/routes/123456')).toBe('123456');
      expect(RouteParser.getRouteId('https://www.strava.com/activities/789')).toBe('789');
      expect(RouteParser.getRouteId('http://ridewithgps.com/routes/12345')).toBe('12345');
    });

    test('should return null for invalid URLs', () => {
      expect(RouteParser.getRouteId('https://example.com/route/123')).toBeNull();
      expect(RouteParser.getRouteId('not-a-url')).toBeNull();
    });
  });

  describe('parseStravaRoute', () => {
    test('should parse route page with Detail_routeStat class', () => {
      const html = `
        <div>
          <div class="Detail_routeStat__xyz123">
            <svg>
              <path d="some-path-data"></path>
            </svg>
            <span>94.2 km</span>
          </div>
        </div>
      `;
      const $ = cheerio.load(html);
      const result = RouteParser.parseStravaRoute($, 'https://www.strava.com/routes/123456');
      expect(result).toEqual({
        distance: 94,
        duration: 283 // ~4.7 hours at 20 km/h, Math.round((94.2 / 20) * 60)
      });
    });

    test('should parse activity page with data-cy attributes', () => {
      const html = `
        <div>
          <div data-cy="summary-distance">
            <div>45.6 km</div>
          </div>
          <div data-cy="summary-time">
            <div>2h 15m</div>
          </div>
        </div>
      `;
      const $ = cheerio.load(html);
      const result = RouteParser.parseStravaRoute($, 'https://www.strava.com/activities/123456');
      expect(result).toEqual({
        distance: 46,
        duration: 135 // 2h 15m in minutes
      });
    });

    test('should return null for invalid HTML', () => {
      const html = '<div>Invalid content</div>';
      const $ = cheerio.load(html);
      const result = RouteParser.parseStravaRoute($, 'https://www.strava.com/routes/123456');
      expect(result).toBeNull();
    });
  });

  describe('parseRideWithGPSRoute', () => {
    test('should parse route details', () => {
      const html = `
        <div class="route-stats">
          <div class="distance">50.5 km</div>
          <div class="time">2h 30m</div>
        </div>
      `;
      const $ = cheerio.load(html);
      const result = RouteParser.parseRideWithGPSRoute($);
      expect(result).toEqual({
        distance: 50.5, // Parser returns exact value, not rounded
        duration: 150 // 2h 30m in minutes
      });
    });

    test('should return null for invalid HTML', () => {
      const html = '<div>Invalid content</div>';
      const $ = cheerio.load(html);
      const result = RouteParser.parseRideWithGPSRoute($);
      expect(result).toBeNull();
    });
  });

  describe('parseKomootRoute', () => {
    test('should parse route details', () => {
      const html = `
        <div class="tour-stats">
          <div class="distance">30.8 km</div>
          <div class="duration">1h 45m</div>
        </div>
      `;
      const $ = cheerio.load(html);
      const result = RouteParser.parseKomootRoute($);
      expect(result).toEqual({
        distance: 30.8, // Parser returns exact value, not rounded
        duration: 105 // 1h 45m in minutes
      });
    });

    test('should return null for invalid HTML', () => {
      const html = '<div>Invalid content</div>';
      const $ = cheerio.load(html);
      const result = RouteParser.parseKomootRoute($);
      expect(result).toBeNull();
    });
  });
}); 
