/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { ShareRideCommandHandler } from '../../commands/ShareRideCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('ShareRideCommandHandler (%s)', (language) => {
  let handler;
  let mockRideService;
  let mockCtx;
  let mockMessageFormatter;
  let mockRideMessagesService;
  const tr = (key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' });

  beforeEach(() => {
    mockRideService = {
      getRide: jest.fn()
    };

    mockRideMessagesService = {
      extractRideId: jest.fn(),
      createRideMessage: jest.fn()
    };

    mockMessageFormatter = {};

    mockCtx = {
      message: {
        text: '/shareride 123',
        message_thread_id: null
      },
      lang: language,
      from: {
        id: 789,
        first_name: 'Test',
        username: 'testuser'
      },
      chat: {
        id: 101112
      },
      reply: jest.fn().mockResolvedValue({ message_id: 131415 })
    };

    handler = new ShareRideCommandHandler(mockRideService, mockMessageFormatter, mockRideMessagesService);
  });

  describe('handle', () => {
    it('replies with parse error when ride id is missing', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({
        rideId: null,
        error: tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'shareride' })
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('services.rideMessages.provideRideIdAfterCommand', { commandName: 'shareride' })
      );
      expect(mockRideService.getRide).not.toHaveBeenCalled();
    });

    it('replies when ride does not exist', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue(null);

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.common.rideNotFoundByIdWithDot', { id: '123' }));
    });

    it('blocks repost by non-creator', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 456, cancelled: false, messages: [] });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.share.onlyCreatorRepost'));
      expect(mockRideMessagesService.createRideMessage).not.toHaveBeenCalled();
    });

    it('allows repost by non-creator when ride settings allow reposts', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        createdBy: 456,
        cancelled: false,
        messages: [],
        settings: {
          allowReposts: true
        }
      });
      mockRideMessagesService.createRideMessage.mockResolvedValue({ sentMessage: { message_id: 42 } });

      await handler.handle(mockCtx);

      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: '123' }),
        mockCtx,
        null
      );
      expect(mockCtx.reply).not.toHaveBeenCalledWith(tr('commands.share.onlyCreatorRepost'));
    });

    it('blocks repost for cancelled ride', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 789, cancelled: true, messages: [] });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.share.cannotRepostCancelled'));
    });

    it('does not repost when ride already posted in current chat', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        createdBy: 789,
        cancelled: false,
        messages: [{ chatId: 101112, messageId: 999 }]
      });

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.share.alreadyPostedInChat', { topicSuffix: '' }), {
        message_thread_id: null
      });
      expect(mockRideMessagesService.createRideMessage).not.toHaveBeenCalled();
    });

    it('reposts ride in current chat when allowed', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({
        id: '123',
        createdBy: 789,
        cancelled: false,
        messages: [{ chatId: 222222, messageId: 999 }]
      });
      mockRideMessagesService.createRideMessage.mockResolvedValue({ sentMessage: { message_id: 42 } });

      await handler.handle(mockCtx);

      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: '123' }),
        mockCtx,
        null
      );
      expect(mockCtx.reply).not.toHaveBeenCalledWith(expect.stringContaining(tr('commands.share.failedToPost')));
    });

    it('returns user-friendly error when repost fails', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockResolvedValue({ id: '123', createdBy: 789, cancelled: false, messages: [] });
      const error = new Error('Bot error');
      error.description = 'Forbidden: bot was blocked by the user';
      mockRideMessagesService.createRideMessage.mockRejectedValue(error);

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        tr('commands.share.failedToPostWithError', { error: tr('commands.share.botNotMemberOrBlocked') })
      );
    });

    it('handles unexpected service errors', async () => {
      mockRideMessagesService.extractRideId.mockReturnValue({ rideId: '123', error: null });
      mockRideService.getRide.mockRejectedValue(new Error('Database error'));

      await handler.handle(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(tr('commands.share.postingError'));
    });
  });

  describe('shareRideToChat', () => {
    it('passes topic id when reposting in a forum topic', async () => {
      const topicCtx = {
        ...mockCtx,
        message: { ...mockCtx.message, message_thread_id: 5678 }
      };
      const ride = { id: '123', messages: [] };
      mockRideMessagesService.createRideMessage.mockResolvedValue({ sentMessage: { message_id: 131415 } });

      const result = await handler.shareRideToChat(ride, topicCtx);

      expect(mockRideMessagesService.createRideMessage).toHaveBeenCalledWith(ride, topicCtx, 5678);
      expect(result).toEqual({ success: true });
    });

    it('maps permission-related telegram errors', async () => {
      const ride = { id: '123', messages: [] };
      const permissionError = new Error('Permission error');
      permissionError.description = 'Bad Request: not enough rights to send text messages to the chat';
      mockRideMessagesService.createRideMessage.mockRejectedValue(permissionError);

      const result = await handler.shareRideToChat(ride, mockCtx);

      expect(result).toEqual({
        success: false,
        error: tr('commands.share.botNoPermission')
      });
    });

    it('returns generic error for unexpected failures', async () => {
      mockRideMessagesService.createRideMessage.mockRejectedValue(new Error('Unexpected error'));

      const result = await handler.shareRideToChat({ id: '123', messages: [] }, mockCtx);

      expect(result).toEqual({ success: false, error: tr('commands.share.failedToPost') });
    });
  });
});
