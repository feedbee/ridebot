import { CalendarEventService } from '../../services/CalendarEventService.js';

const NOW = new Date('2026-08-29T08:00:00.000Z');

function createRide(overrides = {}) {
  return {
    id: 'ride123',
    title: 'Zażółć 🚴 Ride',
    date: new Date('2026-08-30T08:00:00.000Z'),
    duration: 150,
    meetingPoint: 'Park; gate, north',
    organizer: 'Ola',
    distance: 55,
    additionalInfo: 'Bring lights\nand water',
    routes: [{ label: 'Long route', url: 'https://example.com/route/1' }],
    ...overrides
  };
}

describe('CalendarEventService', () => {
  let service;

  beforeEach(() => {
    service = new CalendarEventService();
  });

  it('builds one UTC event contract and provider links from a ride', () => {
    const result = service.createExport(createRide(), { now: NOW, language: 'en' });

    expect(result.status).toBe('ok');
    expect(result.event).toEqual(expect.objectContaining({
      uid: 'ride-ride123@ridebot',
      title: 'Zażółć 🚴 Ride',
      start: new Date('2026-08-30T08:00:00.000Z'),
      end: new Date('2026-08-30T10:30:00.000Z'),
      location: 'Park; gate, north'
    }));

    const googleUrl = new URL(result.googleUrl);
    expect(googleUrl.origin + googleUrl.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(googleUrl.searchParams.get('action')).toBe('TEMPLATE');
    expect(googleUrl.searchParams.get('text')).toBe('Zażółć 🚴 Ride');
    expect(googleUrl.searchParams.get('dates')).toBe('20260830T080000Z/20260830T103000Z');
    expect(googleUrl.searchParams.get('location')).toBe('Park; gate, north');

    const outlookUrl = new URL(result.outlookUrl);
    expect(outlookUrl.searchParams.get('subject')).toBe('Zażółć 🚴 Ride');
    expect(outlookUrl.searchParams.get('startdt')).toBe('2026-08-30T08:00:00.000Z');
    expect(outlookUrl.searchParams.get('enddt')).toBe('2026-08-30T10:30:00.000Z');
  });

  it.each([null, undefined])('uses a one-hour event when duration is %s', (duration) => {
    const result = service.createExport(createRide({ duration }), { now: NOW, language: 'en' });

    expect(result.status).toBe('ok');
    expect(result.event.start).toEqual(new Date('2026-08-30T08:00:00.000Z'));
    expect(result.event.end).toEqual(new Date('2026-08-30T09:00:00.000Z'));
    expect(new URL(result.googleUrl).searchParams.get('dates'))
      .toBe('20260830T080000Z/20260830T090000Z');
  });

  it('generates an escaped RFC 5545 document with CRLF and a safe filename', () => {
    const result = service.createExport(createRide(), { now: NOW, language: 'en' });

    expect(result.filename).toBe('ride-ride123.ics');
    expect(result.mimeType).toBe('text/calendar; charset=utf-8');
    expect(result.ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(result.ics).toContain('UID:ride-ride123@ridebot\r\n');
    expect(result.ics).toContain('DTSTAMP:20260829T080000Z\r\n');
    expect(result.ics).toContain('DTSTART:20260830T080000Z\r\n');
    expect(result.ics).toContain('DTEND:20260830T103000Z\r\n');
    expect(result.ics).toContain('LOCATION:Park\\; gate\\, north\r\n');
    expect(result.ics).toContain('Bring lights\\nand water');
    expect(result.ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(result.ics.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('folds long Unicode content lines to at most 75 UTF-8 octets', () => {
    const result = service.createExport(createRide({
      title: 'Очень длинное название поездки 🚴 '.repeat(6)
    }), { now: NOW, language: 'ru' });

    const physicalLines = result.ics.split('\r\n').filter(Boolean);
    expect(physicalLines.some(line => line.startsWith(' '))).toBe(true);
    expect(physicalLines.every(line => Buffer.byteLength(line, 'utf8') <= 75)).toBe(true);
  });

  it.each([
    ['invalid_ride', createRide({ id: '../bad' })],
    ['cancelled', createRide({ cancelled: true })],
    ['missing_duration', createRide({ duration: 0 })],
    ['missing_duration', createRide({ duration: -1 })],
    ['missing_duration', createRide({ duration: 1.5 })],
    ['past', createRide({ date: new Date('2026-08-29T07:59:59.000Z') })]
  ])('returns %s without generating export data', (expectedStatus, ride) => {
    const result = service.createExport(ride, { now: NOW, language: 'en' });

    expect(result).toEqual({ status: expectedStatus });
  });
});
