/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { UpdateRideCommandHandler } from '../../commands/UpdateRideCommandHandler.js';
import { RideParamsHelper } from '../../utils/RideParamsHelper.js';
import { t } from '../../i18n/index.js';

jest.mock('../../utils/RideParamsHelper.js');

RideParamsHelper.parseRideParams = jest.fn();
RideParamsHelper.VALID_PARAMS = {
  title: 'Title of the ride',
  when: 'Date and time of the ride',
  meet: 'Meeting point',
  route: 'Route URL',
  category: 'Ride category'
};

describe.each(['en', 'ru'])('UpdateRideCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockWizard;
  let mockRideMessagesService;
  let mockCtx;

  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    jest.clearAllMocks();

    mockRideService = {
      getRide: jest.fn(),
      updateRideFromParams: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn(),
      updateRideMessages: jest.fn()
    };

    mockMessageFormatter = {};

    mockWizard = {
      startWizard: jest.fn().mockResolvedValue({})
    };

    mockCtx = {
      message: {
        text: '/updateride #123',
        message_id: 456
      },
      lang: language,
      chat: {
        id: 789
      },
      from: {
        id: 101112,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      },
      reply: jest.fn().mockResolvedValue({})
    };

    handler = new UpdateRideCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockWizard,
      mockRideMessagesService
    );
  });

  describe('handle', () => {
    it('replies when ride is not found', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(null);

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.common.rideNotFoundById', { id: '123' }));
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });

    it('blocks non-creator from updating', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 999, cancelled: false });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.update.onlyCreator'));
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });

    it('starts wizard with ride prefill when no inline params are provided', async () => {
      const ride = {
        id: '123',
        createdBy: 101112,
        title: 'Test Ride',
        category: 'Road',
        organizer: 'Alice',
        date: new Date('2025-03-30T10:00:00Z'),
        meetingPoint: 'Test Point',
        routeLink: 'http://test.com',
        distance: 50,
        duration: 120,
        speedMin: 25,
        speedMax: 30,
        additionalInfo: 'bring lights'
      };

      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(ride);

      await handler.handle(mockCtx);

      expect(mockWizard.startWizard).toHaveBeenCalledWith(
        mockCtx,
        expect.objectContaining({
          isUpdate: true,
          originalRideId: '123',
          title: 'Test Ride',
          meetingPoint: 'Test Point'
        })
      );
    });

    it('updates ride directly when params are present', async () => {
      const ride = { id: '123', createdBy: 101112, title: 'Test Ride' };
      mockCtx.message.text = '/updateride #123\ntitle: Updated Ride\nwhen: tomorrow 11:00';

      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(ride);
      RideParamsHelper.parseRideParams.mockReturnValue({
        params: { title: 'Updated Ride', when: 'tomorrow 11:00' },
        unknownParams: []
      });

      mockRideService.updateRideFromParams.mockResolvedValue({
        ride: { ...ride, title: 'Updated Ride' },
        error: null
      });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });

      await handler.handle(mockCtx);

      expect(mockRideService.updateRideFromParams).toHaveBeenCalledWith(
        '123',
        { title: 'Updated Ride', when: 'tomorrow 11:00' },
        101112,
        { language }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.updated'),
          count: 1
        })
      );
      expect(mockWizard.startWizard).not.toHaveBeenCalled();
    });

    it('stops and replies when params contain unknown keys', async () => {
      mockCtx.message.text = '/updateride #123\nlocation: Somewhere';
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 101112 });
      RideParamsHelper.parseRideParams.mockReturnValue({ params: {}, unknownParams: ['location'] });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalled();
      expect(mockRideService.updateRideFromParams).not.toHaveBeenCalled();
    });
  });

  describe('handleWithParams', () => {
    it('returns update error from service', async () => {
      const originalRide = { id: '123' };
      const params = { when: 'invalid date' };

      mockRideService.updateRideFromParams.mockResolvedValue({ ride: null, error: tr('parsers.date.invalidFormat') });

      await handler.handleWithParams(mockCtx, originalRide, params);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('parsers.date.invalidFormat'));
      expect(mockCtx.reply).not.toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.updated'),
          count: 1
        }))
      );
    });

    it('reports no-updates case from message propagation', async () => {
      const originalRide = { id: '123' };
      const params = { title: 'Updated Ride' };

      mockRideService.updateRideFromParams.mockResolvedValue({
        ride: { id: '123', title: 'Updated Ride' },
        error: null
      });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 0,
        removedCount: 0
      });

      await handler.handleWithParams(mockCtx, originalRide, params);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.common.rideActionNoMessagesUpdated', {
          action: tr('commands.common.actions.updated')
        })
      );
    });

    it('includes removed counter in success response for multi-chat propagation', async () => {
      const originalRide = { id: '123' };
      const params = { title: 'Updated Ride' };

      mockRideService.updateRideFromParams.mockResolvedValue({
        ride: { id: '123', title: 'Updated Ride' },
        error: null
      });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1
      });

      await handler.handleWithParams(mockCtx, originalRide, params);

      const replyText = mockCtx.reply.mock.calls[0][0];
      expect(replyText).toContain(
        tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.updated'),
          count: 2
        })
      );
      expect(replyText).toContain(tr('commands.common.removedUnavailableMessages', { count: 1 }));
    });
  });

  describe('updateRideMessage', () => {
    it('delegates message updates to ride message service', async () => {
      const ride = { id: '123', title: 'Test Ride' };
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 0, removedCount: 0 });

      await handler.updateRideMessage(ride, mockCtx);

      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });

    it('logs when ride message update fails', async () => {
      const ride = { id: '123', messages: [{ messageId: 789, chatId: 101112 }] };
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: false, error: 'Database error' });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await handler.updateRideMessage(ride, mockCtx);
        expect(consoleErrorSpy).toHaveBeenCalled();
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });
});
