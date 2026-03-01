/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DeleteRideCommandHandler } from '../../commands/DeleteRideCommandHandler.js';
import { InlineKeyboard } from 'grammy';

jest.mock('../../config.js', () => ({
  config: {
    buttons: {
      confirmDelete: 'Yes, delete',
      cancelDelete: 'No, keep it'
    }
  }
}));

describe('DeleteRideCommandHandler', () => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn(),
      deleteRide: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn()
    };

    mockMessageFormatter = {
      formatDeleteConfirmation: jest.fn().mockReturnValue('Are you sure you want to delete this ride?')
    };

    mockCtx = {
      reply: jest.fn().mockResolvedValue({}),
      api: {
        deleteMessage: jest.fn().mockResolvedValue({})
      },
      from: { id: 123 },
      message: { text: '/deleteride 456' }
    };

    handler = new DeleteRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('handle', () => {
    it('replies with extraction error', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: null, error: 'No ride ID found' });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('No ride ID found');
    });

    it('blocks non-creator from delete flow', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999 });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith('Only the ride creator can delete this ride.');
    });

    it('shows confirmation keyboard for creator', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123 });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        'Are you sure you want to delete this ride?',
        expect.objectContaining({ reply_markup: expect.any(InlineKeyboard) })
      );
    });
  });

  describe('handleConfirmation', () => {
    beforeEach(() => {
      mockCtx = {
        match: ['delete:confirm:456', 'confirm', '456'],
        editMessageText: jest.fn().mockResolvedValue({}),
        answerCallbackQuery: jest.fn().mockResolvedValue({}),
        api: {
          deleteMessage: jest.fn().mockResolvedValue({})
        },
        from: { id: 123 }
      };
    });

    it('cancels deletion when cancel action is used', async () => {
      mockCtx.match = ['delete:cancel:456', 'cancel', '456'];

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Deletion cancelled.');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Deletion cancelled');
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });

    it('reports missing ride', async () => {
      mockRideService.getRide.mockResolvedValue(null);

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Ride not found.');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride not found');
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });

    it('blocks deletion by non-creator', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999 });

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Only the ride creator can delete this ride.');
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });

    it('deletes ride and reports per-message results across chats', async () => {
      mockRideService.getRide.mockResolvedValue({
        id: '456',
        createdBy: 123,
        messages: [
          { chatId: 1001, messageId: 2001 },
          { chatId: 1002, messageId: 2002 },
          { chatId: 1003, messageId: 2003 }
        ]
      });
      mockRideService.deleteRide.mockResolvedValue(true);
      mockCtx.api.deleteMessage
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Message not found'))
        .mockResolvedValueOnce({});

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.api.deleteMessage).toHaveBeenCalledTimes(3);
      const text = mockCtx.editMessageText.mock.calls[0][0];
      expect(text).toContain('Ride deleted successfully.');
      expect(text).toContain('Deleted 2 message(s).');
      expect(text).toContain('Removed 1 unavailable message(s).');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Ride deleted successfully');
    });

    it('reports failed ride deletion', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123 });
      mockRideService.deleteRide.mockResolvedValue(false);

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith('Failed to delete ride.');
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Failed to delete ride');
    });
  });
});
