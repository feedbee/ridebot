/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { HelpCommandHandler } from '../../commands/HelpCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('HelpCommandHandler (%s)', (language) => {
  const expectedHelpPart1Fragments = {
    en: [
      '<b>🚲 Ride Announcement Bot Help</b>',
      '<b>➕ Creating a New Ride</b>',
      '/fromstrava',
      'settings.allowReposts'
    ],
    ru: [
      '<b>🚲 Помощь по Ride Announcement Bot</b>',
      '<b>➕ Создание новой поездки</b>',
      '/fromstrava',
      'settings.allowReposts'
    ]
  };

  const expectedHelpPart2Fragments = {
    en: [
      '<b>🔄 Updating a Ride</b>',
      '<b>❌ Cancelling a Ride</b>',
      '<b>↩️ Resuming a Cancelled Ride</b>',
      '<b>🗑 Deleting a Ride</b>',
      '<b>🔄 Duplicating a Ride</b>',
      '<b>📋 Listing Your Rides</b>'
    ],
    ru: [
      '<b>🔄 Обновление поездки</b>',
      '<b>❌ Отмена поездки</b>',
      '<b>↩️ Возобновление отмененной поездки</b>',
      '<b>🗑 Удаление поездки</b>',
      '<b>🔄 Дублирование поездки</b>',
      '<b>📋 Список ваших поездок</b>'
    ]
  };

  const expectedHelpPart3Fragments = {
    en: [
      '<b>⚙️ Ride Settings</b>',
      '<b>🧭 Private Creator Buttons</b>',
      '<b>📢 Sharing a Ride</b>'
    ],
    ru: [
      '<b>⚙️ Настройки поездок</b>',
      '<b>🧭 Кнопки управления в личном чате</b>',
      '<b>📢 Публикация поездки</b>'
    ]
  };

  let helpCommandHandler;
  let mockRideService;
  let mockMessageFormatter;
  let mockCtx;
  
  beforeEach(() => {
    // Create mock RideService
    mockRideService = {};
    
    // Create mock MessageFormatter
    mockMessageFormatter = {};
    
    // Create mock Grammy context
    mockCtx = {
      api: {
        getMe: jest.fn().mockResolvedValue({ username: 'testbot' })
      },
      lang: language,
      t: jest.fn((key, params = {}) => t(language, key, params, { fallbackLanguage: 'en' })),
      reply: jest.fn().mockResolvedValue({})
    };
    
    // Create HelpCommandHandler instance with mocks
    helpCommandHandler = new HelpCommandHandler(mockRideService, mockMessageFormatter);
  });
  
  describe('handle', () => {
    it('should reply with all help message parts from config', async () => {
      // Execute
      await helpCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.reply).toHaveBeenCalledTimes(3);
      const [helpPart1, options1] = mockCtx.reply.mock.calls[0];
      const [helpPart2, options2] = mockCtx.reply.mock.calls[1];
      const [helpPart3, options3] = mockCtx.reply.mock.calls[2];
      expect(helpPart1).toContain('/newride');
      expect(helpPart2).toContain('/updateride');
      expect(helpPart2).toContain('/cancelride');
      expect(helpPart2).toContain('/resumeride');
      expect(helpPart2).toContain('/deleteride');
      expect(helpPart2).toContain('/dupride');
      expect(helpPart2).toContain('/listrides');
      expect(helpPart3).toContain('/shareride@testbot');
      expect(helpPart3).toContain('/settings');
      expect(helpPart3).toContain('/joinchat');
      expect(helpPart3).not.toContain('@botname');
      for (const fragment of expectedHelpPart1Fragments[language]) {
        expect(helpPart1).toContain(fragment);
      }
      for (const fragment of expectedHelpPart2Fragments[language]) {
        expect(helpPart2).toContain(fragment);
      }
      for (const fragment of expectedHelpPart3Fragments[language]) {
        expect(helpPart3).toContain(fragment);
      }
      expect(options1).toEqual({ parse_mode: 'HTML' });
      expect(options2).toEqual({ parse_mode: 'HTML' });
      expect(options3).toEqual({ parse_mode: 'HTML' });
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help1');
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help2');
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help3');
    });
  });
});
