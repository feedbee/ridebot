/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { CancelRideCommandHandler } from '../../commands/CancelRideCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('CancelRideCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn(),
      cancelRide: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn(),
      updateRideMessages: jest.fn()
    };

    mockMessageFormatter = {};

    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      lang: language,
      from: { id: 123 },
      message: { text: '/cancelride 456' }
    };

    handler = new CancelRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('handle', () => {
    it('replies with extraction error', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({
        rideId: null,
        error: tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'cancelride' })
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'cancelride' })
      );
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });

    it('blocks non-creator from cancelling', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999, cancelled: false });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.stateChange.onlyCreator', { action: tr('commands.common.verbs.cancel') })
      );
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });

    it('reports already cancelled ride', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.cancel.alreadyCancelled'));
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });

    it('cancels ride and reports updated messages', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: false });
      mockRideService.cancelRide.mockResolvedValue({ id: '456', cancelled: true });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });

      await handler.handle(mockCtx);

      expect(mockRideService.cancelRide).toHaveBeenCalledWith('456', 123);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.cancelled'),
          count: 1
        })
      );
    });

    it('reports both updated and removed counters for multi-chat propagation', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: false });
      mockRideService.cancelRide.mockResolvedValue({ id: '456', cancelled: true });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 2,
        removedCount: 1
      });

      await handler.handle(mockCtx);

      const replyText = mockCtx.reply.mock.calls[0][0];
      expect(replyText).toContain(
        tr('commands.common.rideActionUpdatedMessages', {
          action: tr('commands.common.actions.cancelled'),
          count: 2
        })
      );
      expect(replyText).toContain(tr('commands.common.removedUnavailableMessages', { count: 1 }));
    });
  });

  describe('updateRideMessage', () => {
    it('delegates to ride message service', async () => {
      const ride = { id: '123', title: 'Test Ride' };
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: true, updatedCount: 0, removedCount: 0 });

      await handler.updateRideMessage(ride, mockCtx);

      expect(mockRideMessagesService.updateRideMessages).toHaveBeenCalledWith(ride, mockCtx);
    });

    it('logs error if update fails', async () => {
      const ride = { id: '123', messages: [{ messageId: 456, chatId: 789 }] };
      mockRideMessagesService.updateRideMessages.mockResolvedValue({ success: false, error: 'Failed to update' });
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
