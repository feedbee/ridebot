/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { StartCommandHandler } from '../../commands/StartCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('StartCommandHandler (%s)', (language) => {
  const expectedStartFragments = {
    en: [
      '<b>🚲 Welcome to Ride Announcement Bot!</b>',
      '<b>Key Features:</b>',
      '<b>Quick Start:</b>',
      '<b>More details:</b>',
      'Happy cycling! 🚴‍♀️💨'
    ],
    ru: [
      '<b>🚲 Добро пожаловать в Ride Announcement Bot!</b>',
      '<b>Ключевые возможности:</b>',
      '<b>Быстрый старт:</b>',
      '<b>Подробнее:</b>',
      'Хороших покатушек! 🚴‍♀️💨'
    ]
  };

  let startHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCtx;

  beforeEach(() => {
    // Create mock services (required by BaseCommandHandler)
    mockRideService = {
      getRide: jest.fn()
    };

    mockMessageFormatter = {
      formatRideDetails: jest.fn()
    };

    mockRideMessagesService = {
      updateRideMessages: jest.fn()
    };

    // Create mock Grammy context
    mockCtx = {
      reply: jest.fn().mockResolvedValue({
        message_id: 123,
        chat: { id: 456 }
      }),
      api: {
        getMe: jest.fn().mockResolvedValue({ username: 'testbot' })
      },
      lang: language,
      t: jest.fn((key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' })),
      message: {
        from: {
          id: 789,
          username: 'testuser'
        },
        chat: {
          id: 456,
          type: 'private'
        }
      }
    };

    // Create handler instance
    startHandler = new StartCommandHandler(
      mockRideService,
      mockMessageFormatter,
      mockRideMessagesService
    );
  });

  describe('handle', () => {
    it('should send the start message with HTML formatting', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify
      expect(mockCtx.reply).toHaveBeenCalledTimes(1);
      const [message, options] = mockCtx.reply.mock.calls[0];
      expect(message).toContain('/shareride@testbot');
      expect(message).not.toContain('@botname');
      expect(options).toEqual({ parse_mode: 'HTML' });
      expect(mockCtx.t).toHaveBeenCalledWith('templates.start');
    });

    it('should handle reply failures gracefully', async () => {
      // Setup - make reply throw an error
      const error = new Error('Network error');
      mockCtx.reply.mockRejectedValue(error);

      // Execute and verify it throws
      await expect(startHandler.handle(mockCtx)).rejects.toThrow('Network error');
    });

    it('should work in all chat types', async () => {
      const chatTypes = ['private', 'group', 'supergroup'];
      
      for (const chatType of chatTypes) {
        // Reset mock before each iteration
        mockCtx.reply.mockClear();
        
        // Setup - set chat type
        mockCtx.message.chat.type = chatType;

        // Execute
        await startHandler.handle(mockCtx);

        // Verify message was sent
        expect(mockCtx.reply).toHaveBeenCalled();
      }
    });

    it('should use the configured start message template', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify user-facing content was preserved
      const callArgs = mockCtx.reply.mock.calls[0];
      expect(callArgs[0]).toContain('/newride');
      expect(callArgs[0]).toContain('/help');
      expect(callArgs[0]).toContain('/listrides');
      expect(callArgs[0]).toContain('@testbot');
      expect(callArgs[0]).not.toContain('@botname');
      for (const fragment of expectedStartFragments[language]) {
        expect(callArgs[0]).toContain(fragment);
      }
    });

    it('should include HTML parse mode in options', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify
      const callArgs = mockCtx.reply.mock.calls[0];
      expect(callArgs[1]).toEqual({ parse_mode: 'HTML' });
    });
  });
});
