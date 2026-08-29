import { config } from '../config.js';
import { t } from '../i18n/index.js';
import { getCategoryLabel } from '../utils/category-utils.js';
import { getRideRoutes } from '../utils/route-links.js';

const MINUTE_MS = 60_000;
const DEFAULT_DURATION_MINUTES = 60;
const MAX_ICAL_LINE_OCTETS = 75;

/**
 * Build provider-neutral calendar exports from rides.
 */
export class CalendarEventService {
  /**
   * Build provider links and an iCalendar document for a ride.
   * @param {Object} ride
   * @param {Object} [options={}]
   * @param {Date} [options.now]
   * @param {string} [options.language]
   * @returns {Object}
   */
  createExport(ride, options = {}) {
    const now = options.now || new Date();
    const status = this.getExportStatus(ride, now);
    if (status !== 'ok') {
      return { status };
    }

    const language = options.language || config.i18n.defaultLanguage;
    const start = new Date(ride.date);
    const duration = ride.duration ?? DEFAULT_DURATION_MINUTES;
    const event = {
      uid: `ride-${ride.id}@ridebot`,
      title: ride.title,
      start,
      end: new Date(start.getTime() + duration * MINUTE_MS),
      location: ride.meetingPoint || '',
      description: this.buildDescription(ride, language)
    };

    return {
      status: 'ok',
      event,
      googleUrl: this.buildGoogleUrl(event),
      outlookUrl: this.buildOutlookUrl(event),
      ics: this.buildIcs(event, now),
      filename: `ride-${ride.id}.ics`,
      mimeType: 'text/calendar; charset=utf-8'
    };
  }

  /**
   * Validate whether the ride can be exported.
   * @param {Object} ride
   * @param {Date} now
   * @returns {'ok'|'invalid_ride'|'cancelled'|'missing_duration'|'past'}
   */
  getExportStatus(ride, now) {
    const start = new Date(ride?.date);
    if (
      !ride ||
      !/^\w+$/.test(ride.id || '') ||
      typeof ride.title !== 'string' ||
      !ride.title.trim() ||
      Number.isNaN(start.getTime())
    ) {
      return 'invalid_ride';
    }
    if (ride.cancelled) return 'cancelled';
    if (ride.duration != null && (!Number.isInteger(ride.duration) || ride.duration <= 0)) {
      return 'missing_duration';
    }
    if (start <= now) return 'past';
    return 'ok';
  }

  /**
   * Render useful ride details as plain calendar text.
   * @param {Object} ride
   * @param {string} language
   * @returns {string}
   */
  buildDescription(ride, language) {
    const translate = (key) => t(language, key, {}, {
      fallbackLanguage: config.i18n.fallbackLanguage,
      withMissingMarker: config.isDev
    });
    const lines = [`Ride #${ride.id}`];

    if (ride.organizer) {
      lines.push(`${translate('formatter.labels.organizer')}: ${ride.organizer}`);
    }
    if (ride.category) {
      lines.push(`${translate('formatter.labels.category')}: ${getCategoryLabel(ride.category, language)}`);
    }
    if (ride.distance) {
      lines.push(`${translate('formatter.labels.distance')}: ${ride.distance} ${translate('formatter.units.km')}`);
    }
    if (ride.additionalInfo) {
      lines.push(`${translate('formatter.labels.additionalInfo')}: ${ride.additionalInfo}`);
    }

    const routes = getRideRoutes(ride);
    if (routes.length > 0) {
      lines.push(`${translate('formatter.labels.route')}:`);
      lines.push(...routes.map(route => route.url));
    }

    return lines.join('\n');
  }

  /**
   * Build a prefilled Google Calendar URL.
   * @param {Object} event
   * @returns {string}
   */
  buildGoogleUrl(event) {
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', event.title);
    url.searchParams.set('dates', `${this.formatUtc(event.start)}/${this.formatUtc(event.end)}`);
    url.searchParams.set('details', event.description);
    if (event.location) url.searchParams.set('location', event.location);
    return url.toString();
  }

  /**
   * Build a prefilled Outlook Calendar URL.
   * @param {Object} event
   * @returns {string}
   */
  buildOutlookUrl(event) {
    const url = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
    url.searchParams.set('path', '/calendar/action/compose');
    url.searchParams.set('rru', 'addevent');
    url.searchParams.set('subject', event.title);
    url.searchParams.set('startdt', event.start.toISOString());
    url.searchParams.set('enddt', event.end.toISOString());
    url.searchParams.set('body', event.description);
    if (event.location) url.searchParams.set('location', event.location);
    return url.toString();
  }

  /**
   * Build an RFC 5545 iCalendar document.
   * @param {Object} event
   * @param {Date} now
   * @returns {string}
   */
  buildIcs(event, now) {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Ridebot//Ride Calendar//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${this.escapeIcsText(event.uid)}`,
      `DTSTAMP:${this.formatUtc(now)}`,
      `DTSTART:${this.formatUtc(event.start)}`,
      `DTEND:${this.formatUtc(event.end)}`,
      `SUMMARY:${this.escapeIcsText(event.title)}`
    ];
    if (event.location) lines.push(`LOCATION:${this.escapeIcsText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${this.escapeIcsText(event.description)}`);
    lines.push('END:VEVENT', 'END:VCALENDAR');

    return `${lines.flatMap(line => this.foldIcsLine(line)).join('\r\n')}\r\n`;
  }

  /**
   * Escape an iCalendar TEXT value.
   * @param {string} value
   * @returns {string}
   */
  escapeIcsText(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  /**
   * Fold a content line without splitting UTF-8 code points.
   * @param {string} line
   * @returns {string[]}
   */
  foldIcsLine(line) {
    const folded = [];
    let current = '';
    let limit = MAX_ICAL_LINE_OCTETS;

    for (const character of line) {
      if (Buffer.byteLength(current + character, 'utf8') > limit) {
        folded.push(current);
        current = ` ${character}`;
        limit = MAX_ICAL_LINE_OCTETS;
      } else {
        current += character;
      }
    }
    folded.push(current);
    return folded;
  }

  /**
   * Format a Date as an iCalendar UTC timestamp.
   * @param {Date} date
   * @returns {string}
   */
  formatUtc(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }
}
