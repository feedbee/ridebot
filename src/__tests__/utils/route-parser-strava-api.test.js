/**
 * Tests for RouteParser.parseStravaViaApi.
 * Uses jest.unstable_mockModule + dynamic imports (required for ESM).
 *
 * getStravaAccessToken is mocked at the token-store boundary so these tests
 * focus purely on route-parser's responsibility: selecting the right API
 * endpoint, parsing the response, and handling errors.
 * OAuth flow / token refresh logic is tested in strava-token-store tests.
 */
import { jest } from '@jest/globals';

const mockFetch = jest.fn();
const mockGetAccessToken = jest.fn().mockResolvedValue('test-access-token');

jest.unstable_mockModule('node-fetch', () => ({ default: mockFetch }));
jest.unstable_mockModule('../../utils/strava-token-store.js', () => ({
  getStravaAccessToken: mockGetAccessToken
}));

const { RouteParser } = await import('../../utils/route-parser.js');
const { config } = await import('../../config.js');

function mockApiResponse(body) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => body });
}

describe('parseStravaViaApi', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetAccessToken.mockReset().mockResolvedValue('test-access-token');

    config.strava.clientId = 'test-client-id';
    config.strava.clientSecret = 'test-client-secret';
    config.strava.refreshToken = 'test-refresh-token';
  });

  afterEach(() => {
    config.strava.clientId = null;
    config.strava.clientSecret = null;
    config.strava.refreshToken = null;
  });

  test('parses route — uses /routes/ endpoint and estimated_moving_time', async () => {
    mockApiResponse({ distance: 94200, estimated_moving_time: 16980 });

    const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/123456');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/routes/123456',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-access-token' } })
    );
    expect(result).toEqual({ distance: 94, duration: 283 });
  });

  test('parses activity — uses /activities/ endpoint and moving_time', async () => {
    mockApiResponse({ distance: 45600, moving_time: 8100 });

    const result = await RouteParser.parseStravaViaApi('https://www.strava.com/activities/789');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/activities/789',
      expect.anything()
    );
    expect(result).toEqual({ distance: 46, duration: 135 });
  });

  test('falls back to 20 km/h estimate when estimated_moving_time is 0', async () => {
    mockApiResponse({ distance: 60000, estimated_moving_time: 0 });

    const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/999');

    expect(result).toEqual({ distance: 60, duration: 180 });
  });

  test('returns null on API error response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

    const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/404');

    expect(result).toBeNull();
  });

  test('returns null when getStravaAccessToken throws (no refresh token)', async () => {
    mockGetAccessToken.mockRejectedValueOnce(new Error('No Strava refresh token available'));

    const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/123');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('returns null when clientId is not configured', async () => {
    config.strava.clientId = null;

    const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/123');

    expect(result).toBeNull();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  test('returns null when clientSecret is not configured', async () => {
    config.strava.clientSecret = null;

    const result = await RouteParser.parseStravaViaApi('https://www.strava.com/routes/123');

    expect(result).toBeNull();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });
});
