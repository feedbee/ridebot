import { jest } from '@jest/globals';

const mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({ default: mockFetch }));
const { RouteParser } = await import('../../utils/route-parser.js');
const { getDerivedRouteLabel } = await import('../../utils/route-links.js');
const url = 'https://getgpx.link/tracks/w43WIsUese7VXUMlFLNH_';

describe('GetGPX routes', () => {
  beforeEach(() => mockFetch.mockReset());

  test('recognizes track links, extracts opaque IDs and derives the label', () => {
    expect(RouteParser.getRouteProvider(url)).toBe('getgpx');
    expect(RouteParser.getRouteId(`${url}/?share=1`)).toBe('w43WIsUese7VXUMlFLNH_');
    expect(RouteParser.getRouteId('https://getgpx.link/tracks/abc-123')).toBe('abc-123');
    expect(RouteParser.extractKnownRouteUrls(`Маршрут: ${url}`)).toEqual([url]);
    expect(getDerivedRouteLabel(url)).toBe('GetGPX');
  });

  test.each(['https://getgpx.link/tracks/', 'https://getgpx.link.evil/tracks/abc',
    'https://evil.test/https://getgpx.link/tracks/abc', 'https://getgpx.link/tracks/abc/analysis'])('rejects invalid track URL %s', value => {
    expect(RouteParser.isKnownProvider(value)).toBe(false);
  });

  test('loads API metrics in kilometers and converts milliseconds to minutes', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { metrics: {
      distanceKm: 201.74289630686482, estimatedDurationMs: 29050977.068188533,
      durationMs: null, movingTimeMs: null
    } } }) });
    expect(await RouteParser.processRouteInfo(url)).toEqual({ routeLink: url, distance: 202, duration: 484 });
    expect(mockFetch).toHaveBeenCalledWith('https://getgpx.link/api/v1/tracks/w43WIsUese7VXUMlFLNH_', {
      headers: { Accept: 'application/json' }
    });
  });

  test('keeps available distance when duration is absent', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { metrics: { distanceKm: 42.3 } } }) });
    expect(await RouteParser.parseRoute(url)).toEqual({ distance: 42 });
  });

  test.each([{}, { data: {} }, { data: { metrics: { distanceKm: -1, estimatedDurationMs: 'bad' } } }])('ignores missing or invalid metrics', async payload => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => payload });
    expect(await RouteParser.parseRoute(url)).toBeNull();
  });

  test('preserves the link on HTTP errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    expect(await RouteParser.processRouteInfo(url)).toEqual({ routeLink: url });
  });

  test('preserves the link on network or JSON errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network unavailable'));
    expect(await RouteParser.processRouteInfo(url)).toEqual({ routeLink: url });
    mockFetch.mockResolvedValue({ ok: true, json: async () => { throw new Error('Invalid JSON'); } });
    expect(await RouteParser.processRouteInfo(url)).toEqual({ routeLink: url });
  });
});
