/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ResumeRideCommandHandler } from '../../commands/ResumeRideCommandHandler.js';

describe('ResumeRideCommandHandler', () => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn(),
      resumeRide: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn(),
      updateRideMessages: jest.fn()
    };

    mockMessageFormatter = {};

    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      from: { id: 123 },
      message: { text: '/resumeride 456' }
    };

    handler = new ResumeRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('handle', () => {
    it('replies with extraction error', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: null, error: 'No ride ID found' });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('No ride ID found');
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });

    it('blocks non-creator from resuming', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999, cancelled: true });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can resume this ride.');
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });

    it('reports non-cancelled ride', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: false });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('This ride is not cancelled.');
      expect(mockRideService.resumeRide).not.toHaveBeenCalled();
    });

    it('resumes ride and reports update count', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });
      mockRideService.resumeRide.mockResolvedValue({ id: '456', cancelled: false });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 1,
        removedCount: 0
      });

      await handler.handle(mockCtx);

      expect(mockRideService.resumeRide).toHaveBeenCalledWith('456', 123);
      const replyText = mockCtx.reply.mock.calls[0][0];
      expect(replyText).toContain('Ride resumed successfully.');
      expect(replyText).toContain('Updated 1 message(s)');
    });

    it('reports when no messages were updated', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });
      mockRideService.resumeRide.mockResolvedValue({ id: '456', cancelled: false });
      mockRideMessagesService.updateRideMessages.mockResolvedValue({
        success: true,
        updatedCount: 0,
        removedCount: 0
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Ride has been resumed, but no messages were updated. You may want to /shareride the ride in the chats of your choice again, they could have been removed.');
    });

    it('reports removed unavailable messages for multi-chat propagation', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, cancelled: true });
      mockRideService.resumeRide.mockResolvedValue({ id: '456', cancelled: false });
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
});
