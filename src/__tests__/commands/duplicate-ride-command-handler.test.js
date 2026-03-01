/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DuplicateRideCommandHandler } from '../../commands/DuplicateRideCommandHandler.js';
import { RideParamsHelper } from '../../utils/RideParamsHelper.js';

jest.mock('../../utils/RideParamsHelper.js');

RideParamsHelper.parseRideParams = jest.fn();
RideParamsHelper.VALID_PARAMS = {
  title: 'Title of the ride',
  when: 'Date and time of the ride',
  meet: 'Meeting point',
  speed: 'Speed range'
};

describe('DuplicateRideCommandHandler', () => {
  let handler;
  let mockRideService;
  let mockRideMessagesService;
  let mockMessageFormatter;
  let mockWizard;
  let mockCtx;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRideService = {
      getRide: jest.fn(),
      duplicateRide: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn(),
      createRideMessage: jest.fn().mockResolvedValue({})
    };

    mockMessageFormatter = {};

    mockWizard = {
      startWizard: jest.fn().mockResolvedValue({})
    };

    mockCtx = {
      message: { text: '/dupride #123' },
      from: {
        id: 101112,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      },
      reply: jest.fn().mockResolvedValue({})
    };

    handler = new DuplicateRideCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockWizard,
      mockRideMessagesService
    );
  });

  describe('handle', () => {
    it('replies with extraction error when ride cannot be resolved', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: null, error: 'Ride #123 not found' });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Ride #123 not found');
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });

    it('starts wizard with prefilled data and tomorrow date', async () => {
      const originalDate = new Date('2025-03-30T10:00:00Z');
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        title: 'Test Ride',
        date: originalDate,
        meetingPoint: 'Test Location',
        routeLink: 'https://example.com/route',
        distance: 50,
        duration: 180,
        speedMin: 25,
        speedMax: 30
      });

      await handler.handle(mockCtx);

      expect(mockWizard.startWizard).toHaveBeenCalledWith(
        mockCtx,
        expect.objectContaining({
          title: 'Test Ride',
          datetime: new Date('2025-03-31T10:00:00.000Z'),
          meetingPoint: 'Test Location'
        })
      );
    });

    it('duplicates ride directly when command contains params', async () => {
      mockCtx.message.text = '/dupride #123\ntitle: New Ride\nwhen: tomorrow 11:00';
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', title: 'Old Ride', date: new Date('2025-03-30T10:00:00Z') });
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: { title: 'New Ride', when: 'tomorrow 11:00' },
        unknownParams: []
      });
      mockRideService.duplicateRide.mockResolvedValue({ ride: { id: '456', title: 'New Ride' }, error: null });

      await handler.handle(mockCtx);

      expect(mockRideService.duplicateRide).toHaveBeenCalledWith(
        '123',
        { title: 'New Ride', when: 'tomorrow 11:00' },
        mockCtx.from
      );
      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith({ id: '456', title: 'New Ride' }, mockCtx);
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride duplicated successfully!');
    });
  });

  describe('handleWithParams', () => {
    it('returns service error to user and skips message posting', async () => {
      mockRideService.duplicateRide.mockResolvedValue({
        ride: null,
        error: 'Invalid date format. Please use format: DD.MM.YYYY HH:MM or natural language like "tomorrow 18:00"'
      });

      await handler.handleWithParams(mockCtx, { id: '123' }, { when: 'invalid date' });

      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('Invalid date format'));
      expect(mockRideMessagesService.createRideMessage).not.toHaveBeenCalled();
    });

    it('posts duplicate in topic context and confirms success', async () => {
      const topicCtx = {
        ...mockCtx,
        message: { ...mockCtx.message, message_thread_id: 5678 },
        reply: jest.fn().mockResolvedValue({})
      };

      mockRideService.duplicateRide.mockResolvedValue({
        ride: { id: '789', title: 'Topic Ride' },
        error: null
      });

      await handler.handleWithParams(topicCtx, { id: '123' }, { title: 'Topic Ride' });

      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(
        { id: '789', title: 'Topic Ride' },
        topicCtx
      );
      expect(topicCtx.reply).toHaveBeenCalledWith('Ride duplicated successfully!');
    });
  });
});
