import { jest } from '@jest/globals';
import { RouteParser } from '../../utils/route-parser.js';
import { config } from '../../config.js';
import { invalidateStravaTokenCache } from '../../utils/strava-token-store.js';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      expect(RouteParser.isKnownProvider('https://connect.garmin.com/app/activity/12345678')).toBe(true);
      expect(RouteParser.isKnownProvider('https://connect.garmin.com/app/course/12345678')).toBe(true);
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
      expect(RouteParser.getRouteProvider('https://connect.garmin.com/app/activity/12345678')).toBe('garmin');
      expect(RouteParser.getRouteProvider('https://connect.garmin.com/app/course/12345678')).toBe('garmin');
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

  describe('parseStravaViaApi', () => {
    let origClientId, origClientSecret;

    beforeEach(() => {
      origClientId = config.strava.clientId;
      origClientSecret = config.strava.clientSecret;
      invalidateStravaTokenCache();
    });

    afterEach(() => {
      config.strava.clientId = origClientId;
      config.strava.clientSecret = origClientSecret;
      invalidateStravaTokenCache();
    });

    test('returns null when clientId not configured', async () => {
      config.strava.clientId = null;
      const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/123456');
      expect(result).toBeNull();
    });

    test('returns null when clientSecret not configured', async () => {
      config.strava.clientSecret = null;
      const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/123456');
      expect(result).toBeNull();
    });
  });

  describe('parseRoute (Strava dispatch)', () => {
    test('delegates Strava URLs to parseStravaViaApi', async () => {
      const spy = jest
        .spyOn(RouteParser, 'parseStravaViaApi')
        .mockResolvedValueOnce({ distance: 50, duration: 150 });

      const result = await RouteParser.parseRoute('https://www.strava.com/routes/123456');

      expect(spy).toHaveBeenCalledWith('https://www.strava.com/routes/123456');
      expect(result).toEqual({ distance: 50, duration: 150 });
      spy.mockRestore();
    });

    test('delegates Strava activity URLs to parseStravaViaApi', async () => {
      const spy = jest
        .spyOn(RouteParser, 'parseStravaViaApi')
        .mockResolvedValueOnce({ distance: 46, duration: 135 });

      const result = await RouteParser.parseRoute('https://www.strava.com/activities/789');

      expect(spy).toHaveBeenCalledWith('https://www.strava.com/activities/789');
      expect(result).toEqual({ distance: 46, duration: 135 });
      spy.mockRestore();
    });
  });

  describe('parseRideWithGPSRoute', () => {
    test('should parse route details', () => {
      const htmlPath = path.join(__dirname, '../../test-setup/html/ridewithgps-route.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      const $ = cheerio.load(html);
      const result = RouteParser.parseRideWithGPSRoute($, 'https://ridewithgps.com/routes/48435067');
      expect(result).toEqual({
        distance: 163.3
      });
    });

    describe('parseRideWithGPSActivity', () => {
      test('should parse activity details', () => {
        const htmlPath = path.join(__dirname, '../../test-setup/html/ridewithgps-activity.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(html);
        const result = RouteParser.parseRideWithGPSRoute($, 'https://ridewithgps.com/trips/369168327');
        expect(result).toEqual({
          distance: 57.0,
          duration: 137
        });
      });

      test('should return null for invalid HTML', () => {
        const html = '<div>Invalid content</div>';
        const $ = cheerio.load(html);
        const result = RouteParser.parseRideWithGPSRoute($, 'https://ridewithgps.com/routes/48435067');
        expect(result).toBeNull();
      });
    });
  });

  describe('parseKomootRoute', () => {
    test('should parse route details', () => {
      const htmlPath = path.join(__dirname, '../../test-setup/html/komoot-route.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      const $ = cheerio.load(html);
      const result = RouteParser.parseKomootRoute($);
      expect(result).toEqual({
        distance: 57.6, // Parser returns exact value, not rounded
        duration: 123 // 2h 03m in minutes
      });
    });

    describe('parseKomootActivity', () => {
      test('should parse route details from recorded activity', () => {
        const htmlPath = path.join(__dirname, '../../test-setup/html/komoot-activity.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        const $ = cheerio.load(html);
        const result = RouteParser.parseKomootRoute($);
        expect(result).toEqual({
          distance: 57.0, // Parser returns exact value, not rounded
          duration: 137 // 2h 17m in minutes
        });
      });

      test('should return null for invalid HTML', () => {
        const html = '<div>Invalid content</div>';
        const $ = cheerio.load(html);
        const result = RouteParser.parseKomootRoute($);
        expect(result).toBeNull();
      });
    });

    describe('processRouteInfo', () => {
      test('should process valid route URLs', async () => {
        const parseRouteSpy = jest
          .spyOn(RouteParser, 'parseRoute')
          .mockResolvedValue({ distance: 50, duration: 180 });

        const result = await RouteParser.processRouteInfo('https://www.strava.com/routes/123456');

        expect(result).toEqual({
          routeLink: 'https://www.strava.com/routes/123456',
          distance: 50,
          duration: 180
        });
        parseRouteSpy.mockRestore();
      });

      test('should handle invalid URL formats', async () => {
        const result = await RouteParser.processRouteInfo('not-a-url');

        expect(result).toEqual({
          error: 'Invalid URL format. Please provide a valid URL.',
          routeLink: 'not-a-url'
        });
      });

      test('should handle unknown providers', async () => {
        const result = await RouteParser.processRouteInfo('https://unknown.com/route');

        expect(result).toEqual({
          routeLink: 'https://unknown.com/route'
        });
      });

      test('should handle partial route parsing results', async () => {
        const parseRouteSpy = jest
          .spyOn(RouteParser, 'parseRoute')
          .mockResolvedValue({ distance: 50 });

        const result = await RouteParser.processRouteInfo('https://www.strava.com/routes/123456');

        expect(result).toEqual({
          routeLink: 'https://www.strava.com/routes/123456',
          distance: 50
        });
        parseRouteSpy.mockRestore();
      });

      test('should handle null result from route parser', async () => {
        const parseRouteSpy = jest.spyOn(RouteParser, 'parseRoute').mockResolvedValue(null);

        const result = await RouteParser.processRouteInfo('https://www.strava.com/routes/123456');

        expect(result).toEqual({
          routeLink: 'https://www.strava.com/routes/123456'
        });
        parseRouteSpy.mockRestore();
      });
    });
  });

  describe('parseGarminRoute', () => {
    test('should parse activity details', () => {
      const htmlPath = path.join(__dirname, '../../test-setup/html/garmin-activity.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      const $ = cheerio.load(html);
      const result = RouteParser.parseGarminRoute($, 'https://connect.garmin.com/app/activity/22070080926');
      expect(result).toEqual({
        distance: 57.01,
        duration: 123 // 2h 2m 59s → 123 min (59s rounds up)
      });
    });

    test('should return null for route page with no metrics', () => {
      const htmlPath = path.join(__dirname, '../../test-setup/html/garmin-route.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      const $ = cheerio.load(html);
      const result = RouteParser.parseGarminRoute($, 'https://connect.garmin.com/app/course/12345678');
      expect(result).toBeNull();
    });

    test('should return null for invalid HTML', () => {
      const html = '<div>Invalid content</div>';
      const $ = cheerio.load(html);
      const result = RouteParser.parseGarminRoute($, 'https://connect.garmin.com/app/activity/12345678');
      expect(result).toBeNull();
    });
  });
});
