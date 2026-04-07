import fetch from 'node-fetch';
import { config } from '../config.js';
import { getStravaAccessToken } from './strava-token-store.js';
import { RouteParser } from './route-parser.js';

const STRAVA_EVENT_URL_PATTERN = /https?:\/\/(?:www\.)?strava\.com\/clubs\/(\d+)\/group_events\/(\d+)/;

const ACTIVITY_TYPE_TO_CATEGORY = {
  GravelRide: 'gravel',
  MountainBikeRide: 'mtb',
  VirtualRide: 'virtual',
  EBikeRide: 'e-bike',
  Ride: 'road',
};

export class StravaEventParser {
  /**
   * Parse a Strava group event URL and extract clubId + eventId.
   * @param {string} url
   * @returns {{ clubId: string, eventId: string } | null}
   */
  static parseEventUrl(url) {
    const match = url && url.match(STRAVA_EVENT_URL_PATTERN);
    if (!match) return null;
    return { clubId: match[1], eventId: match[2] };
  }

  /**
   * Fetch a Strava group event from the API.
   * @param {string} eventId
   * @returns {Promise<Object>} Raw API response
   * @throws On network/auth errors
   */
  static async fetchEvent(eventId) {
    const { clientId, clientSecret } = config.strava;
    const token = await getStravaAccessToken(clientId, clientSecret);
    const response = await fetch(
      `https://www.strava.com/api/v3/group_events/${eventId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw new Error(`Strava API error: ${response.status} ${response.statusText}`);
    }
    const event = await response.json();

    // Group Events API returns route as a summary (id only, no distance/time).
    // Fetch full route details to get those fields.
    if (event.route) {
      const routeId = event.route.id_str ?? String(event.route.id);
      try {
        const routeResponse = await fetch(
          `https://www.strava.com/api/v3/routes/${routeId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (routeResponse.ok) {
          event.route = await routeResponse.json();
        }
      } catch {
        // Route fetch is best-effort; proceed with what we have
      }
    }

    return event;
  }

  /**
   * Map a Strava activity type string to a bot category code.
   * @param {string} type
   * @returns {string}
   */
  static mapActivityTypeToCategory(type) {
    return ACTIVITY_TYPE_TO_CATEGORY[type] ?? 'mixed';
  }

  /**
   * Find the first known-provider route URL in a text string.
   * @param {string} text
   * @returns {string | null}
   */
  static extractRouteFromDescription(text) {
    return RouteParser.extractFirstKnownRouteUrl(text);
  }

  /**
   * Build pace groups string for additionalInfo.
   * Strava pace groups can use pace (sec/km) or speed (km/h).
   * Returns null if no pace groups present.
   * @param {Array} paceGroups
   * @param {string} paceType - 'pace' | 'speed'
   * @returns {string | null}
   */
  static buildPaceGroupsText(paceGroups, paceType) {
    if (!paceGroups || paceGroups.length === 0) return null;

    const labels = paceGroups.map(group => {
      const center = group.pace ?? group.target_pace_metric;
      const range = group.range ?? group.pace_range_metric ?? 0;
      if (center == null) return null;

      if (paceType === 'pace') {
        // pace is in seconds per meter → convert to min/km
        const centerMinKm = (center * 1000) / 60;
        const halfRange = (range * 1000) / 60;
        const lo = Math.max(0, centerMinKm - halfRange);
        const hi = centerMinKm + halfRange;
        const fmt = (v) => {
          const m = Math.floor(v);
          const s = Math.round((v - m) * 60);
          return `${m}:${String(s).padStart(2, '0')}`;
        };
        return `${fmt(lo)}-${fmt(hi)} min/km`;
      } else {
        // speed in km/h
        const lo = Math.round(center - range);
        const hi = Math.round(center + range);
        return lo === hi ? `${lo} km/h` : `${lo}-${hi} km/h`;
      }
    }).filter(Boolean);

    if (labels.length === 0) return null;
    return 'Pace groups: ' + labels.join(' • ');
  }

  /**
   * Extract speedMin / speedMax from pace groups (speed-based only).
   * Returns {} if pace groups are pace-based or missing.
   * @param {Array} paceGroups
   * @param {string} paceType
   * @returns {{ speedMin?: number, speedMax?: number }}
   */
  static extractSpeedRange(paceGroups, paceType) {
    if (!paceGroups || paceGroups.length === 0 || paceType !== 'speed') return {};

    let min = Infinity;
    let max = -Infinity;

    for (const group of paceGroups) {
      const center = group.pace ?? group.target_pace_metric;
      const range = group.range ?? group.pace_range_metric ?? 0;
      if (center == null) continue;
      const lo = center - range;
      const hi = center + range;
      if (lo < min) min = lo;
      if (hi > max) max = hi;
    }

    const result = {};
    if (min !== Infinity) result.speedMin = Math.round(min);
    if (max !== -Infinity) result.speedMax = Math.round(max);
    return result;
  }

  /**
   * Build the additionalInfo string: Strava event link + description + pace groups.
   * @param {Object} event - Raw Strava event
   * @param {string} eventUrl - Original Strava event URL
   * @returns {string}
   */
  static buildAdditionalInfo(event, eventUrl) {
    const parts = [];

    parts.push(eventUrl);

    if (event.description) {
      parts.push(event.description);
    }

    const paceGroupsText = this.buildPaceGroupsText(
      event.pace_groups ?? event.upcoming_occurrences?.[0]?.pace_groups,
      event.pace_type ?? 'speed'
    );
    if (paceGroupsText) {
      parts.push(paceGroupsText);
    }

    return parts.join('\n');
  }

  /**
   * Map a raw Strava group event API response to ride fields.
   * @param {Object} event - Raw Strava API response
   * @param {number} createdBy - Telegram user ID of the bot user creating the ride
   * @param {string} eventUrl - Original Strava event URL (for additionalInfo)
   * @param {string} eventId - Event ID extracted from the URL (preserves precision)
   * @returns {Object} Partial ride data (no id/createdAt/participation)
   */
  static mapToRideData(event, createdBy, eventUrl, eventId) {
    // Use eventId from URL to preserve numeric precision (JS floats lose precision on large IDs)
    const stravaId = eventId ?? String(event.id);
    const rideData = {
      createdBy,
      title: event.title,
      date: new Date(event.start_datetime),
      category: this.mapActivityTypeToCategory(event.type ?? event.activity_type),
      metadata: { stravaId },
    };

    if (event.address) {
      rideData.meetingPoint = event.address;
    }

    // Organizer: club name
    if (event.club?.name) {
      rideData.organizer = event.club.name;
    }

    // Route: prefer attached route object, fall back to description link
    if (event.route) {
      const routeIdStr = event.route.id_str ?? String(event.route.id);
      rideData.routeLink = `https://www.strava.com/routes/${routeIdStr}`;
      if (event.route.distance) {
        rideData.distance = Math.round(event.route.distance / 1000);
      }
      if (event.route.estimated_moving_time) {
        rideData.duration = Math.round(event.route.estimated_moving_time / 60);
      }
    } else {
      const descriptionRouteUrl = this.extractRouteFromDescription(event.description);
      if (descriptionRouteUrl) {
        rideData.routeLink = descriptionRouteUrl;
      }
    }

    // Speed range from pace groups (speed-based only)
    const paceType = event.pace_type ?? 'speed';
    const paceGroups = event.pace_groups ?? event.upcoming_occurrences?.[0]?.pace_groups;
    const speedRange = this.extractSpeedRange(paceGroups, paceType);
    Object.assign(rideData, speedRange);

    // additionalInfo: event link + description + pace groups detail
    rideData.additionalInfo = this.buildAdditionalInfo(event, eventUrl);

    return rideData;
  }
}
