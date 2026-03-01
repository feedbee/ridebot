/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { CancelRideCommandHandler } from '../../commands/CancelRideCommandHandler.js';

describe('CancelRideCommandHandler', () => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

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
      from: { id: 123 },
      message: { text: '/cancelride 456' }
    };

    handler = new CancelRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('handle', () => {
    it('replies with extraction error', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: null, error: 'No ride ID found' });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('No ride ID found');
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });

    it('blocks non-creator from cancelling', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999, cancelled: false });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can cancel this ride.');
      expect(mockRideService.cancelRide).not.toHaveBeenCalled();
    });

    it('reports already cancelled ride', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('This ride is already cancelled.');
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
      expect(mockCtx.reply).toHaveBeenCalledWith('Ride cancelled successfully. Updated 1 message(s).');
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
      expect(replyText).toContain('Updated 2 message(s)');
      expect(replyText).toContain('Removed 1 unavailable message(s)');
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
