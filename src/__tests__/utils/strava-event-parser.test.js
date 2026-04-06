/**
 * @jest-environment node
 */

import { StravaEventParser } from '../../utils/strava-event-parser.js';

// Note: fetchEvent() is an integration-level method that calls the Strava API.
// It is covered by manual testing rather than unit tests here.

describe('StravaEventParser', () => {
  describe('parseEventUrl', () => {
    it('parses a valid Strava group event URL', () => {
      const result = StravaEventParser.parseEventUrl(
        'https://www.strava.com/clubs/1263108/group_events/3475149607264155570'
      );
      expect(result).toEqual({ clubId: '1263108', eventId: '3475149607264155570' });
    });

    it('parses without www', () => {
      const result = StravaEventParser.parseEventUrl(
        'https://strava.com/clubs/99/group_events/123'
      );
      expect(result).toEqual({ clubId: '99', eventId: '123' });
    });

    it('returns null for a non-event Strava URL', () => {
      expect(StravaEventParser.parseEventUrl('https://www.strava.com/routes/123')).toBeNull();
    });

    it('returns null for a completely different URL', () => {
      expect(StravaEventParser.parseEventUrl('https://example.com')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(StravaEventParser.parseEventUrl('')).toBeNull();
    });

    it('returns null for null', () => {
      expect(StravaEventParser.parseEventUrl(null)).toBeNull();
    });
  });

  describe('mapActivityTypeToCategory', () => {
    it.each([
      ['GravelRide', 'gravel'],
      ['MountainBikeRide', 'mtb'],
      ['VirtualRide', 'virtual'],
      ['EBikeRide', 'e-bike'],
      ['Ride', 'road'],
      ['Run', 'mixed'],
      [undefined, 'mixed'],
    ])('%s → %s', (type, expected) => {
      expect(StravaEventParser.mapActivityTypeToCategory(type)).toBe(expected);
    });
  });

  describe('extractRouteFromDescription', () => {
    it('finds a Strava route link', () => {
      const text = 'Check this route: https://www.strava.com/routes/1234567890 have fun!';
      expect(StravaEventParser.extractRouteFromDescription(text))
        .toBe('https://www.strava.com/routes/1234567890');
    });

    it('finds a Strava activity link', () => {
      const text = 'Previous ride https://www.strava.com/activities/999 was great';
      expect(StravaEventParser.extractRouteFromDescription(text))
        .toBe('https://www.strava.com/activities/999');
    });

    it('finds a RideWithGPS link', () => {
      const text = 'Route: https://ridewithgps.com/routes/42';
      expect(StravaEventParser.extractRouteFromDescription(text))
        .toBe('https://ridewithgps.com/routes/42');
    });

    it('finds a Komoot link', () => {
      const text = 'https://www.komoot.com/tour/123456789';
      expect(StravaEventParser.extractRouteFromDescription(text))
        .toBe('https://www.komoot.com/tour/123456789');
    });

    it('finds a Garmin link', () => {
      const text = 'See https://connect.garmin.com/modern/course/7654321';
      expect(StravaEventParser.extractRouteFromDescription(text))
        .toBe('https://connect.garmin.com/modern/course/7654321');
    });

    it('returns null when no known route link present', () => {
      expect(StravaEventParser.extractRouteFromDescription('Just some text without links')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(StravaEventParser.extractRouteFromDescription('')).toBeNull();
    });

    it('returns null for null', () => {
      expect(StravaEventParser.extractRouteFromDescription(null)).toBeNull();
    });

    it('ignores unknown URLs and returns first known one', () => {
      const text = 'Random https://example.com/path then https://ridewithgps.com/routes/1 and more';
      expect(StravaEventParser.extractRouteFromDescription(text))
        .toBe('https://ridewithgps.com/routes/1');
    });
  });

  describe('buildPaceGroupsText', () => {
    it('returns null for empty array', () => {
      expect(StravaEventParser.buildPaceGroupsText([], 'speed')).toBeNull();
    });

    it('returns null for null', () => {
      expect(StravaEventParser.buildPaceGroupsText(null, 'speed')).toBeNull();
    });

    it('builds speed-based pace group labels', () => {
      const groups = [
        { pace: 22, range: 1 },
        { pace: 25, range: 1 },
      ];
      const result = StravaEventParser.buildPaceGroupsText(groups, 'speed');
      expect(result).toBe('Pace groups: 21-23 km/h • 24-26 km/h');
    });

    it('handles single pace group with no range', () => {
      const groups = [{ pace: 25, range: 0 }];
      const result = StravaEventParser.buildPaceGroupsText(groups, 'speed');
      expect(result).toBe('Pace groups: 25 km/h');
    });
  });

  describe('extractSpeedRange', () => {
    it('returns {} for pace-based groups', () => {
      const groups = [{ pace: 5.5, range: 0.3 }];
      expect(StravaEventParser.extractSpeedRange(groups, 'pace')).toEqual({});
    });

    it('returns {} for empty groups', () => {
      expect(StravaEventParser.extractSpeedRange([], 'speed')).toEqual({});
    });

    it('extracts min/max across multiple speed groups', () => {
      const groups = [
        { pace: 20, range: 1 },  // 19-21
        { pace: 25, range: 1 },  // 24-26
        { pace: 30, range: 2 },  // 28-32
      ];
      expect(StravaEventParser.extractSpeedRange(groups, 'speed'))
        .toEqual({ speedMin: 19, speedMax: 32 });
    });
  });

  describe('buildAdditionalInfo', () => {
    it('includes event URL and description', () => {
      const event = { description: 'A nice gravel ride', pace_type: 'speed' };
      const result = StravaEventParser.buildAdditionalInfo(event, 'https://strava.com/clubs/1/group_events/2');
      expect(result).toContain('https://strava.com/clubs/1/group_events/2');
      expect(result).toContain('A nice gravel ride');
    });

    it('appends pace groups section when present', () => {
      const event = {
        description: 'Ride',
        pace_type: 'speed',
        pace_groups: [{ pace: 25, range: 1 }],
      };
      const result = StravaEventParser.buildAdditionalInfo(event, 'https://strava.com/clubs/1/group_events/2');
      expect(result).toContain('Pace groups:');
    });

    it('omits pace groups section when absent', () => {
      const event = { description: 'Ride', pace_type: 'speed', pace_groups: [] };
      const result = StravaEventParser.buildAdditionalInfo(event, 'https://strava.com/clubs/1/group_events/2');
      expect(result).not.toContain('Pace groups:');
    });

    it('works with no description', () => {
      const event = { pace_type: 'speed' };
      const result = StravaEventParser.buildAdditionalInfo(event, 'https://strava.com/clubs/1/group_events/2');
      expect(result).toBe('https://strava.com/clubs/1/group_events/2');
    });
  });

  describe('mapToRideData', () => {
    const eventId = '3475149607264155570';
    const eventUrl = `https://www.strava.com/clubs/1263108/group_events/${eventId}`;

    const baseEvent = {
      // id is intentionally omitted to avoid JS float precision issues in tests;
      // the real API returns a large integer that loses precision when parsed as JS number.
      title: 'KULT x K022 South Bound Gravel Ride',
      type: 'GravelRide',
      start_datetime: '2025-04-11T08:00:00Z',
      address: 'Belwederska 44, Warszawa',
      description: 'Great ride',
      club: { name: 'KONTRA022' },
      pace_type: 'speed',
    };

    it('maps basic fields', () => {
      const data = StravaEventParser.mapToRideData(baseEvent, 101, eventUrl, eventId);
      expect(data.title).toBe('KULT x K022 South Bound Gravel Ride');
      expect(data.category).toBe('gravel');
      expect(data.date).toEqual(new Date('2025-04-11T08:00:00Z'));
      expect(data.meetingPoint).toBe('Belwederska 44, Warszawa');
      expect(data.organizer).toBe('KONTRA022');
      expect(data.createdBy).toBe(101);
      expect(data.metadata).toEqual({ stravaId: eventId });
    });

    it('uses attached route for routeLink/distance/duration', () => {
      const event = {
        ...baseEvent,
        route: {
          id_str: '9876543210',
          distance: 95000,
          estimated_moving_time: 14400,
        },
      };
      const data = StravaEventParser.mapToRideData(event, 101, eventUrl, eventId);
      expect(data.routeLink).toBe('https://www.strava.com/routes/9876543210');
      expect(data.distance).toBe(95);
      expect(data.duration).toBe(240);
    });

    it('falls back to description link when no route attached', () => {
      const event = {
        ...baseEvent,
        description: 'Check https://ridewithgps.com/routes/42 for the route',
      };
      const data = StravaEventParser.mapToRideData(event, 101, eventUrl, eventId);
      expect(data.routeLink).toBe('https://ridewithgps.com/routes/42');
      expect(data.distance).toBeUndefined();
    });

    it('stores stravaId as string from URL (preserves precision)', () => {
      const data = StravaEventParser.mapToRideData(baseEvent, 101, eventUrl, eventId);
      expect(data.metadata.stravaId).toBe(eventId);
      expect(typeof data.metadata.stravaId).toBe('string');
    });

    it('includes additionalInfo with event URL', () => {
      const data = StravaEventParser.mapToRideData(baseEvent, 101, eventUrl, eventId);
      expect(data.additionalInfo).toContain(eventUrl);
    });

    it('extracts speed range from pace groups', () => {
      const event = {
        ...baseEvent,
        pace_type: 'speed',
        pace_groups: [
          { pace: 20, range: 1 },
          { pace: 25, range: 1 },
        ],
      };
      const data = StravaEventParser.mapToRideData(event, 101, eventUrl, eventId);
      expect(data.speedMin).toBe(19);
      expect(data.speedMax).toBe(26);
    });
  });

});
