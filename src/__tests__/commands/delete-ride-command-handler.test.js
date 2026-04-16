/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { DeleteRideCommandHandler } from '../../commands/DeleteRideCommandHandler.js';
import { InlineKeyboard } from 'grammy';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('DeleteRideCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

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
      lang: language,
      t: jest.fn((key, params = {}) => tr(key, params)),
      from: { id: 123 },
      message: { text: '/deleteride 456' }
    };

    handler = new DeleteRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('handle', () => {
    it('replies with extraction error', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({
        rideId: null,
        error: tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'deleteride' })
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'deleteride' })
      );
    });

    it('blocks non-creator from delete flow', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '456', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999 });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.delete.onlyCreator'));
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
        match: ['delete:confirm:456:message', 'confirm', '456', 'message'],
        reply: jest.fn().mockResolvedValue({}),
        deleteMessage: jest.fn().mockResolvedValue({}),
        answerCallbackQuery: jest.fn().mockResolvedValue({}),
        api: {
          deleteMessage: jest.fn().mockResolvedValue({})
        },
        lang: language,
        t: jest.fn((key, params = {}) => tr(key, params)),
        from: { id: 123 }
      };
    });

    it('cancels deletion when cancel action is used', async () => {
      mockCtx.match = ['delete:cancel:456:message', 'cancel', '456', 'message'];

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.delete.cancelled'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });

    it('reports missing ride', async () => {
      mockRideService.getRide.mockResolvedValue(null);

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.delete.notFound'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });

    it('reports access errors without masking them as not found', async () => {
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.common.errorAccessingRideData'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });

    it('blocks deletion by non-creator', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999 });

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.delete.onlyCreator'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
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
      expect(mockCtx.deleteMessage).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining(tr('commands.delete.success'))
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
    });

    it('reports failed ride deletion', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123 });
      mockRideService.deleteRide.mockResolvedValue(false);

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.delete.failed'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
    });

    it('uses popup-only completion for callback-origin delete confirmation', async () => {
      mockCtx.match = ['delete:cancel:456:callback', 'cancel', '456', 'callback'];

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
      expect(mockCtx.reply).not.toHaveBeenCalled();
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.delete.cancelled'));
    });

    it('propagates unexpected deletion errors to the callback boundary', async () => {
      mockCtx.match = ['delete:confirm:456:callback', 'confirm', '456', 'callback'];
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123, messages: [] });
      mockRideService.deleteRide.mockRejectedValue(new Error('Delete failed'));

      await expect(handler.handleConfirmation(mockCtx)).rejects.toThrow('Delete failed');
    });
  });
});
