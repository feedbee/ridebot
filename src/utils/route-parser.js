import { config } from '../config.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export class RouteParser {
  /**
   * Check if the URL is from a supported provider that we can parse
   * @param {string} url 
   * @returns {boolean}
   */
  static isKnownProvider(url) {
    return Object.values(config.routeProviders).some(provider => 
      provider.patterns.some(pattern => pattern.test(url))
    );
  }

  /**
   * Check if the string is a valid URL
   * @param {string} url 
   * @returns {boolean}
   */
  static isValidRouteUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get route provider for the URL
   * @param {string} url 
   * @returns {string|null}
   */
  static getRouteProvider(url) {
    for (const [name, provider] of Object.entries(config.routeProviders)) {
      if (provider.patterns.some(pattern => pattern.test(url))) {
        return name;
      }
    }
    return null;
  }

  /**
   * Extract route ID from URL for known providers
   * @param {string} url 
   * @returns {string|null}
   */
  static getRouteId(url) {
    if (!this.isKnownProvider(url)) return null;
    const match = url.match(/\d+$/);
    return match ? match[0] : null;
  }

  /**
   * Parse route details from URL
   * @param {string} url 
   * @returns {Promise<{distance: number, duration: number, error?: string}|null>}
   */
  static async parseRoute(url) {
    // If it's not a known provider, don't try to parse but don't return an error
    if (!this.isKnownProvider(url)) {
      console.warn(`[RouteParser] URL is not from a supported route provider: ${url}`);
      return null;
    }

    const provider = this.getRouteProvider(url);
    if (!provider) {
      console.warn(`[RouteParser] Could not determine route provider for URL: ${url}`);
      return null;
    }

    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.warn(`[RouteParser] Failed to fetch route data: ${response.status} ${response.statusText} for URL: ${url}`);
        return null;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);

      let result;
      switch (provider) {
        case 'strava':
          result = this.parseStravaRoute($, url);
          break;
        case 'ridewithgps':
          result = this.parseRideWithGPSRoute($);
          break;
        case 'komoot':
          result = this.parseKomootRoute($);
          break;
        default:
          console.warn(`[RouteParser] Unsupported provider: ${provider} for URL: ${url}`);
          return null;
      }
      
      if (!result) {
        console.warn(`[RouteParser] Could not parse route data from ${provider} for URL: ${url}`);
        return null;
      }
      
      return result;
    } catch (error) {
      console.warn(`[RouteParser] Error parsing route: ${error.message} for URL: ${url}`);
      return null;
    }
  }

  /**
   * Parse Strava route/activity details
   * @param {cheerio.Root} $ 
   * @param {string} url
   * @returns {{distance?: number, duration?: number}|null}
   */
  static parseStravaRoute($, url) {
    try {
      let distance, duration;

      // Check if it's an activity or a route
      const isActivity = url.includes('/activities/');

      if (isActivity) {
        // Parse activity page using stable data-cy attributes
        const distanceContainer = $('[data-cy="summary-distance"]');
        const timeContainer = $('[data-cy="summary-time"]');
        
        // Get text from the last div in each container (avoiding class-based selectors)
        const distanceText = distanceContainer.find('div').last().text().trim();
        const durationText = timeContainer.find('div').last().text().trim();

        // Extract distance (removing 'km' and converting to number)
        const distanceMatch = distanceText.match(/(\d+(?:\.\d+)?)\s*km/);
        if (distanceMatch) {
          distance = parseFloat(distanceMatch[1]);
        }

        // Parse duration in format "36m 57s" or "1h 30m" or similar
        const durationMatch = durationText.match(/(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1] || '0');
          const minutes = parseInt(durationMatch[2] || '0');
          // We'll round to nearest minute if seconds are present
          const seconds = parseInt(durationMatch[3] || '0');
          duration = hours * 60 + minutes + (seconds >= 30 ? 1 : 0);
        }
      } else {
        // Parse route page using stable selectors
        // Find elements with class starting with Detail_routeStat
        const routeStats = $('div[class^="Detail_routeStat"]');
        
        // Find the distance element by looking for elements with both svg and span
        const distanceElement = routeStats.filter(function() {
          return $(this).find('svg').length > 0 && $(this).find('span').length > 0;
        }).first(); // Take the first one as distance is typically the first stat
        
        if (distanceElement.length) {
          const distanceText = distanceElement.find('span').text().trim();
          
          // Extract distance in kilometers
          const distanceMatch = distanceText.match(/(\d+(?:\.\d+)?)\s*km/);
          if (distanceMatch) {
            distance = parseFloat(distanceMatch[1]);
          }
        }

        // For routes, we'll estimate duration based on average speed of 20 km/h
        if (distance) {
          duration = Math.round((distance / 20) * 60); // Convert to minutes
        }
      }

      // Return any data we were able to parse
      const result = {};
      if (distance) result.distance = Math.round(distance);
      if (duration) result.duration = duration;
      
      // Only return null if we couldn't parse anything
      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      console.warn(`[RouteParser] Error parsing Strava route: ${error.message} for URL: ${url}`);
      return null;
    }
  }

  /**
   * Parse RideWithGPS route details
   * @param {cheerio.Root} $ 
   * @returns {{distance?: number, duration?: number}|null}
   */
  static parseRideWithGPSRoute($) {
    try {
      let distance, duration;
      const distanceText = $('.route-stats').find('.distance').text();
      const durationText = $('.route-stats').find('.time').text();

      // Extract distance in kilometers
      const distanceMatch = distanceText.match(/(\d+(?:\.\d+)?)\s*km/);
      if (distanceMatch) {
        distance = parseFloat(distanceMatch[1]);
      } else {
        console.warn('[RouteParser] Could not extract distance from RideWithGPS route');
      }

      // Extract duration in format "1h 30m" or "45m"
      const durationMatch = durationText.match(/(?:(\d+)h\s*)?(?:(\d+)m)?/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1] || '0');
        const minutes = parseInt(durationMatch[2] || '0');
        duration = hours * 60 + minutes;
      } else {
        console.warn('[RouteParser] Could not extract duration from RideWithGPS route');
      }

      // Return any data we were able to parse
      const result = {};
      if (distance) result.distance = distance;
      if (duration) result.duration = duration;
      
      // Only return null if we couldn't parse anything
      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      console.warn(`[RouteParser] Error parsing RideWithGPS route: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse Komoot route details
   * @param {cheerio.Root} $ 
   * @returns {{distance?: number, duration?: number}|null}
   */
  static parseKomootRoute($) {
    try {
      let distance, duration;
      const distanceText = $('.tour-stats').find('.distance').text();
      const durationText = $('.tour-stats').find('.duration').text();

      // Extract distance in kilometers
      const distanceMatch = distanceText.match(/(\d+(?:\.\d+)?)\s*km/);
      if (distanceMatch) {
        distance = parseFloat(distanceMatch[1]);
      } else {
        console.warn('[RouteParser] Could not extract distance from Komoot route');
      }

      // Extract duration in format "1h 30m" or "45m"
      const durationMatch = durationText.match(/(?:(\d+)h\s*)?(?:(\d+)m)?/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1] || '0');
        const minutes = parseInt(durationMatch[2] || '0');
        duration = hours * 60 + minutes;
      } else {
        console.warn('[RouteParser] Could not extract duration from Komoot route');
      }

      // Return any data we were able to parse
      const result = {};
      if (distance) result.distance = distance;
      if (duration) result.duration = duration;
      
      // Only return null if we couldn't parse anything
      return Object.keys(result).length > 0 ? result : null;
    } catch (error) {
      console.warn(`[RouteParser] Error parsing Komoot route: ${error.message}`);
      return null;
    }
  }
} 
