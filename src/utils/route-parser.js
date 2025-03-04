import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { config } from '../config.js';

export class RouteParser {
  static isValidRouteUrl(url) {
    return Object.values(config.routeProviders).some(provider =>
      provider.patterns.some(pattern => pattern.test(url))
    );
  }

  static getProvider(url) {
    return Object.entries(config.routeProviders).find(([_, provider]) =>
      provider.patterns.some(pattern => pattern.test(url))
    )?.[0];
  }

  static async parseRoute(url) {
    const provider = this.getProvider(url);
    if (!provider) {
      throw new Error('Unsupported route provider');
    }

    try {
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);

      switch (provider) {
        case 'strava':
          return this.parseStravaRoute($);
        case 'ridewithgps':
          return this.parseRideWithGPSRoute($);
        case 'komoot':
          return this.parseKomootRoute($);
        default:
          throw new Error('Unsupported route provider');
      }
    } catch (error) {
      console.error('Error parsing route:', error);
      return null;
    }
  }

  static parseStravaRoute($) {
    const distance = parseFloat($('[data-testid="activity_stats_distance"]').text());
    const duration = this.parseDuration($('[data-testid="activity_stats_time"]').text());
    
    return {
      distance: distance || null,
      duration: duration || null
    };
  }

  static parseRideWithGPSRoute($) {
    const distance = parseFloat($('.stats-ride-basic-stats .distance').text());
    const duration = this.parseDuration($('.stats-ride-basic-stats .moving-time').text());

    return {
      distance: distance || null,
      duration: duration || null
    };
  }

  static parseKomootRoute($) {
    const distance = parseFloat($('.tour-distance').text());
    const duration = this.parseDuration($('.tour-duration').text());

    return {
      distance: distance || null,
      duration: duration || null
    };
  }

  static parseDuration(timeStr) {
    if (!timeStr) return null;

    const parts = timeStr.match(/(\d+)\s*h(?:rs?)?\s*(\d+)\s*m(?:in)?/i);
    if (!parts) return null;

    const [_, hours, minutes] = parts;
    return parseInt(hours) * 60 + parseInt(minutes);
  }
} 
