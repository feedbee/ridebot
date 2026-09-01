/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import { StartCommandHandler } from '../../commands/StartCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('StartCommandHandler (%s)', (language) => {
  const expectedStartFragments = {
    en: [
      '<h2>Welcome to Ride Announcement Bot!</h2>',
      '<h3>Key Features:</h3>',
      '<h3>Quick Start:</h3>',
      '<h3>More details:</h3>',
      'Happy cycling! 🚴‍♀️💨'
    ],
    ru: [
      '<h2>Добро пожаловать в Ride Announcement Bot!</h2>',
      '<h3>Ключевые возможности:</h3>',
      '<h3>Быстрый старт:</h3>',
      '<h3>Подробнее:</h3>',
      'Хороших покатушек! 🚴‍♀️💨'
    ]
  };

  let startHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockRideMessagesService;
  let mockCalendarHandler;
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

    mockCalendarHandler = {
      handleStartPayload: jest.fn().mockResolvedValue(false)
    };

    // Create mock Grammy context
    mockCtx = {
      replyWithRichMessage: jest.fn().mockResolvedValue({
        message_id: 123,
        chat: { id: 456 }
      }),
      api: {
        getMe: jest.fn().mockResolvedValue({ username: 'testbot' })
      },
      match: '',
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
      mockRideMessagesService,
      mockCalendarHandler
    );
  });

  describe('handle', () => {
    it('delegates a calendar deep-link payload without sending the welcome message', async () => {
      mockCtx.match = 'calendar_abc123';
      mockCalendarHandler.handleStartPayload.mockResolvedValue(true);

      await startHandler.handle(mockCtx);

      expect(mockCalendarHandler.handleStartPayload).toHaveBeenCalledWith(mockCtx, 'calendar_abc123');
      expect(mockCtx.replyWithRichMessage).not.toHaveBeenCalled();
    });

    it('should send the full localized Rich HTML with a persistent reply keyboard', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledTimes(1);
      const [richMessage, options] = mockCtx.replyWithRichMessage.mock.calls[0];
      expect(richMessage.html).toContain('<img');
      expect(richMessage.html).toContain('<ul>');
      expect(richMessage.html).toContain('/shareride@testbot');
      expect(richMessage.html).not.toContain('@botname');
      expect(richMessage.html).toContain('<ul><li>');
      expect(richMessage.html).toContain('<ol><li>');
      expect(richMessage.html).toContain('</h2>\n<p>');
      expect(richMessage.html).toContain('</p>\n<h3>');
      expect(richMessage.html).toContain('</ul>\n<h3>');
      expect(richMessage.html).not.toMatch(/<br><br>\s*<h[23]>/);
      expect(richMessage.html).not.toMatch(/<\/h[23]>\s*<br><br>/);
      expect(options.reply_markup.keyboard).toEqual([
        [
          { text: mockCtx.t('buttons.mainMenuButtons') },
          { text: mockCtx.t('buttons.mainMenuCreateWizard') },
          { text: mockCtx.t('buttons.mainMenuSettings') },
          { text: mockCtx.t('buttons.mainMenuHelp') }
        ]
      ]);
      expect(options.reply_markup).toEqual(expect.objectContaining({
        is_persistent: true,
        resize_keyboard: true,
        input_field_placeholder: mockCtx.t('mainMenu.placeholder')
      }));
      expect(mockCtx.t).toHaveBeenCalledWith('templates.start');
    });

    it('should handle reply failures gracefully', async () => {
      // Setup - make reply throw an error
      const error = new Error('Network error');
      mockCtx.replyWithRichMessage.mockRejectedValue(error);

      // Execute and verify it throws
      await expect(startHandler.handle(mockCtx)).rejects.toThrow('Network error');
    });

    it('should work in all chat types', async () => {
      const chatTypes = ['private', 'group', 'supergroup'];
      
      for (const chatType of chatTypes) {
        // Reset mock before each iteration
        mockCtx.replyWithRichMessage.mockClear();
        
        // Setup - set chat type
        mockCtx.message.chat.type = chatType;

        // Execute
        await startHandler.handle(mockCtx);

        // Verify message was sent
        expect(mockCtx.replyWithRichMessage).toHaveBeenCalled();
      }
    });

    it('should use the original configured start message template', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify user-facing content was preserved
      const html = mockCtx.replyWithRichMessage.mock.calls[0][0].html;
      expect(html).toContain('/newride');
      expect(html).toContain('/help');
      expect(html).toContain('/listrides');
      expect(html).toContain('@testbot');
      expect(html).not.toContain('@botname');
      for (const fragment of expectedStartFragments[language]) {
        expect(html).toContain(fragment);
      }
    });

    it('should pass only the reply keyboard as message options', async () => {
      // Execute
      await startHandler.handle(mockCtx);

      // Verify
      const callArgs = mockCtx.replyWithRichMessage.mock.calls[0];
      expect(callArgs[1]).toEqual(expect.objectContaining({
        reply_markup: expect.any(Object)
      }));
      expect(callArgs[1].parse_mode).toBeUndefined();
    });
  });

  describe('closeButtons', () => {
    beforeEach(() => {
      mockCtx.answerCallbackQuery = jest.fn().mockResolvedValue({});
      mockCtx.deleteMessage = jest.fn().mockResolvedValue({});
    });

    it('ignores an already deleted inline menu message', async () => {
      mockCtx.deleteMessage.mockRejectedValue({
        description: 'Bad Request: message to delete not found'
      });

      await expect(startHandler.closeButtons(mockCtx)).resolves.toBeUndefined();

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith();
    });

    it('rethrows unexpected deletion errors', async () => {
      const error = new Error('Telegram unavailable');
      mockCtx.deleteMessage.mockRejectedValue(error);

      await expect(startHandler.closeButtons(mockCtx)).rejects.toBe(error);
    });
  });
});
