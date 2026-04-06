/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { FromStravaCommandHandler } from '../../commands/FromStravaCommandHandler.js';
import { t } from '../../i18n/index.js';

const EVENT_URL = 'https://www.strava.com/clubs/1263108/group_events/3475149607264155570';
const EVENT_ID = '3475149607264155570';

const MOCK_RIDE_DATA = {
  title: 'KULT Gravel Ride',
  date: new Date('2025-04-11T08:00:00Z'),
  category: 'gravel',
  createdBy: 101,
  metadata: { stravaId: EVENT_ID },
};

describe.each(['en', 'ru'])('FromStravaCommandHandler (%s)', (language) => {
  let handler;
  let mockStorage;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockParser;
  let mockCtx;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    jest.clearAllMocks();

    mockStorage = {
      getRideByStravaId: jest.fn(),
      createRide: jest.fn(),
      updateRide: jest.fn(),
    };

    mockRideService = {};
    mockMessageFormatter = {};

    mockRideMessagesService = {
      createRideMessage: jest.fn().mockResolvedValue({}),
      updateRideMessages: jest.fn().mockResolvedValue({ success: true, updatedCount: 1, removedCount: 0 }),
    };

    // Inject parser as a mock object — avoids ESM module mocking complexity
    mockParser = {
      parseEventUrl: jest.fn(),
      fetchEvent: jest.fn(),
      mapToRideData: jest.fn(),
    };

    mockCtx = {
      message: { text: `/fromstrava ${EVENT_URL}` },
      lang: language,
      chat: { id: 789 },
      from: { id: 101, username: 'tester' },
      reply: jest.fn().mockResolvedValue({}),
    };

    handler = new FromStravaCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockRideMessagesService,
      mockStorage,
      mockParser
    );
  });

  describe('invalid URL', () => {
    it('replies with invalidUrl error when no URL given', async () => {
      mockCtx.message.text = '/fromstrava';
      mockParser.parseEventUrl.mockReturnValue(null);

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.fromStrava.invalidUrl'));
      expect(mockStorage.createRide).not.toHaveBeenCalled();
    });

    it('replies with invalidUrl error when URL does not match pattern', async () => {
      mockCtx.message.text = '/fromstrava https://example.com/not-strava';
      mockParser.parseEventUrl.mockReturnValue(null);

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.fromStrava.invalidUrl'));
    });
  });

  describe('Strava API error', () => {
    it('replies with fetchError when API call fails', async () => {
      mockParser.parseEventUrl.mockReturnValue({ clubId: '1263108', eventId: EVENT_ID });
      mockParser.fetchEvent.mockRejectedValue(new Error('Network error'));

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.fromStrava.fetchError'));
      expect(mockStorage.createRide).not.toHaveBeenCalled();
    });
  });

  describe('creating a new ride', () => {
    beforeEach(() => {
      mockParser.parseEventUrl.mockReturnValue({ clubId: '1263108', eventId: EVENT_ID });
      mockParser.fetchEvent.mockResolvedValue({ id: EVENT_ID, title: 'Test' });
      mockParser.mapToRideData.mockReturnValue(MOCK_RIDE_DATA);
      mockStorage.getRideByStravaId.mockResolvedValue(null);
      mockStorage.createRide.mockResolvedValue({ ...MOCK_RIDE_DATA, id: 'abc123' });
    });

    it('creates a new ride when no existing ride found', async () => {
      await handler.handle(mockCtx);

      expect(mockStorage.getRideByStravaId).toHaveBeenCalledWith(EVENT_ID, 101);
      expect(mockStorage.createRide).toHaveBeenCalledWith(MOCK_RIDE_DATA);
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalled();
    });

    it('passes eventId to mapToRideData', async () => {
      await handler.handle(mockCtx);

      expect(mockParser.mapToRideData).toHaveBeenCalledWith(
        expect.anything(),
        101,
        EVENT_URL,
        EVENT_ID
      );
    });

    it('replies with created confirmation', async () => {
      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.fromStrava.created'));
    });

    it('does not call updateRide', async () => {
      await handler.handle(mockCtx);

      expect(mockStorage.updateRide).not.toHaveBeenCalled();
    });
  });

  describe('updating an existing ride', () => {
    const existingRide = { ...MOCK_RIDE_DATA, id: 'existing123', messages: [{ messageId: 1, chatId: 789 }] };

    beforeEach(() => {
      mockParser.parseEventUrl.mockReturnValue({ clubId: '1263108', eventId: EVENT_ID });
      mockParser.fetchEvent.mockResolvedValue({ id: EVENT_ID, title: 'Test' });
      mockParser.mapToRideData.mockReturnValue(MOCK_RIDE_DATA);
      mockStorage.getRideByStravaId.mockResolvedValue(existingRide);
      mockStorage.updateRide.mockResolvedValue({ ...existingRide, title: 'Updated' });
    });

    it('updates the existing ride when same stravaId + user found', async () => {
      await handler.handle(mockCtx);

      expect(mockStorage.updateRide).toHaveBeenCalledWith(
        'existing123',
        expect.objectContaining({ updatedBy: 101 })
      );
    });

    it('calls updateRideMessages after update', async () => {
      await handler.handle(mockCtx);

      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalled();
    });

    it('replies with updated confirmation', async () => {
      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.fromStrava.updated'));
    });

    it('does not call createRide', async () => {
      await handler.handle(mockCtx);

      expect(mockStorage.createRide).not.toHaveBeenCalled();
    });
  });
});
