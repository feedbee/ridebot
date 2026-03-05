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
        match: ['delete:confirm:456', 'confirm', '456'],
        editMessageText: jest.fn().mockResolvedValue({}),
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
      mockCtx.match = ['delete:cancel:456', 'cancel', '456'];

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(tr('commands.delete.cancelledMessage'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.delete.cancelledCallback'));
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });

    it('reports missing ride', async () => {
      mockRideService.getRide.mockResolvedValue(null);

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(tr('commands.delete.notFoundMessage'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.delete.notFoundCallback'));
      expect(mockRideService.deleteRide).not.toHaveBeenCalled();
    });

    it('blocks deletion by non-creator', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 999 });

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.delete.onlyCreator'));
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
      expect(text).toContain(tr('commands.delete.successMessage'));
      expect(text).toContain(tr('commands.delete.deletedMessages', { count: 2 }));
      expect(text).toContain(tr('commands.delete.removedMessages', { count: 1 }));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.delete.successCallback'));
    });

    it('reports failed ride deletion', async () => {
      mockRideService.getRide.mockResolvedValue({ id: '456', createdBy: 123 });
      mockRideService.deleteRide.mockResolvedValue(false);

      await handler.handleConfirmation(mockCtx);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(tr('commands.delete.failedMessage'));
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith(tr('commands.delete.failedCallback'));
    });
  });
});
