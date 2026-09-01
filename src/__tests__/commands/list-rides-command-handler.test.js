/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ListRidesCommandHandler } from '../../commands/ListRidesCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('ListRidesCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    mockRideService = {
      getRidesByCreator: jest.fn()
    };

    mockMessageFormatter = {
      formatRidesList: jest.fn().mockReturnValue('Your rides list')
    };

    mockCtx = {
      replyWithRichMessage: jest.fn().mockResolvedValue({}),
      editMessageText: jest.fn().mockResolvedValue({}),
      deleteMessage: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn().mockResolvedValue({}),
      lang: language,
      t: jest.fn((key, params = {}) => tr(key, params)),
      from: { id: 123 },
      message: { text: '/listrides' },
      match: ['list:2', '2']
    };

    handler = new ListRidesCommandHandler(mockRideService, mockMessageFormatter);
  });

  describe('handle', () => {
    it('shows first page as a normal reply', async () => {
      mockRideService.getRidesByCreator.mockResolvedValue({
        rides: [{ id: '1', title: 'Ride 1' }],
        total: 1
      });

      await handler.handle(mockCtx);

      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 0, 5);
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledWith(
        { html: 'Your rides list' },
        expect.any(Object)
      );
      expect(mockCtx.editMessageText).not.toHaveBeenCalled();
      const keyboard = mockCtx.replyWithRichMessage.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(keyboard).toEqual([[
        expect.objectContaining({ text: tr('buttons.close'), callback_data: 'list:close' })
      ]]);
    });

    it('does not convert a storage failure into an empty list', async () => {
      mockRideService.getRidesByCreator.mockRejectedValue(new Error('Database error'));

      await expect(handler.handle(mockCtx)).rejects.toThrow('Database error');

      expect(mockMessageFormatter.formatRidesList).not.toHaveBeenCalled();
      expect(mockCtx.replyWithRichMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleInlineMenu', () => {
    it('acknowledges the callback and shows the first page', async () => {
      mockRideService.getRidesByCreator.mockResolvedValue({ rides: [], total: 0 });

      await handler.handleInlineMenu(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 0, 5);
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    it('edits message for requested page and answers callback', async () => {
      mockRideService.getRidesByCreator.mockResolvedValue({
        rides: [{ id: '6', title: 'Ride 6' }],
        total: 7
      });

      await handler.handleCallback(mockCtx);

      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 5, 5);
      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        { html: 'Your rides list' },
        expect.any(Object)
      );
      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('handleClose', () => {
    it('acknowledges the callback and deletes the rides list message', async () => {
      await handler.handleClose(mockCtx);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
      expect(mockCtx.deleteMessage).toHaveBeenCalledWith();
    });
  });

  describe('showRidesList', () => {
    it('formats empty result set safely', async () => {
      mockRideService.getRidesByCreator.mockResolvedValue({ rides: [], total: 0 });

      await handler.showRidesList(mockCtx, 1);

      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith([], 1, 1, 0);
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledWith(
        { html: 'Your rides list' },
        expect.not.objectContaining({ parse_mode: expect.anything() })
      );
    });

    it('formats middle page with expected pagination values', async () => {
      const rides = [{ id: '6', title: 'Ride 6' }, { id: '7', title: 'Ride 7' }];
      mockRideService.getRidesByCreator.mockResolvedValue({ rides, total: 15 });

      await handler.showRidesList(mockCtx, 2);

      expect(mockRideService.getRidesByCreator).toHaveBeenCalledWith(123, 5, 5);
      expect(mockMessageFormatter.formatRidesList).toHaveBeenCalledWith(rides, 2, 3, 6);
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalled();
      const keyboard = mockCtx.replyWithRichMessage.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(keyboard.at(-1)).toEqual([
        expect.objectContaining({ text: tr('buttons.close'), callback_data: 'list:close' })
      ]);
    });
  });
});
