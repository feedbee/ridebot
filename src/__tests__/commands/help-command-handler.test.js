/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { HelpCommandHandler } from '../../commands/HelpCommandHandler.js';
import { t } from '../../i18n/index.js';

describe.each(['en', 'ru'])('HelpCommandHandler (%s)', (language) => {
  const expectedHelpPart1Fragments = {
    en: [
      '<h2>Ride Announcement Bot Help</h2>',
      '<h3>➕ Creating a New Ride</h3>',
      '/fromstrava',
      'settings.allowReposts'
    ],
    ru: [
      '<h2>Помощь по Ride Announcement Bot</h2>',
      '<h3>➕ Создание новой поездки</h3>',
      '/fromstrava',
      'settings.allowReposts'
    ]
  };

  const expectedHelpPart2Fragments = {
    en: [
      '<h3>🔄 Updating a Ride</h3>',
      '<h3>❌ Cancelling a Ride</h3>',
      '<h3>↩️ Resuming a Cancelled Ride</h3>',
      '<h3>🗑 Deleting a Ride</h3>',
      '<h3>🔄 Duplicating a Ride</h3>',
      '<h3>📋 Listing Your Rides</h3>'
    ],
    ru: [
      '<h3>🔄 Обновление поездки</h3>',
      '<h3>❌ Отмена поездки</h3>',
      '<h3>↩️ Возобновление отмененной поездки</h3>',
      '<h3>🗑 Удаление поездки</h3>',
      '<h3>🔄 Дублирование поездки</h3>',
      '<h3>📋 Список ваших поездок</h3>'
    ]
  };

  const expectedHelpPart3Fragments = {
    en: [
      '<h2>⚙️ Ride Settings</h2>',
      '<h3>🧭 Private Creator Buttons</h3>',
      '<h3>📢 Sharing a Ride</h3>'
    ],
    ru: [
      '<h2>⚙️ Настройки поездок</h2>',
      '<h3>🧭 Кнопки управления в личном чате</h3>',
      '<h3>📢 Публикация поездки</h3>'
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
      replyWithRichMessage: jest.fn().mockResolvedValue({})
    };
    
    // Create HelpCommandHandler instance with mocks
    helpCommandHandler = new HelpCommandHandler(mockRideService, mockMessageFormatter);
  });
  
  describe('handle', () => {
    it('should send the complete help as two readable Rich Messages', async () => {
      // Execute
      await helpCommandHandler.handle(mockCtx);
      
      // Verify
      expect(mockCtx.replyWithRichMessage).toHaveBeenCalledTimes(2);
      const helpPart1 = mockCtx.replyWithRichMessage.mock.calls[0][0].html;
      const helpPart2 = mockCtx.replyWithRichMessage.mock.calls[1][0].html;
      expect(helpPart1).toContain('/newride');
      expect(helpPart2).toContain('/updateride');
      expect(helpPart2).toContain('/cancelride');
      expect(helpPart2).toContain('/resumeride');
      expect(helpPart2).toContain('/deleteride');
      expect(helpPart2).toContain('/dupride');
      expect(helpPart2).toContain('/listrides');
      expect(helpPart2).toContain('/shareride@testbot');
      expect(helpPart2).toContain('/settings');
      expect(helpPart2).toContain('/joinchat');
      expect(helpPart2).not.toContain('@botname');
      for (const fragment of expectedHelpPart1Fragments[language]) {
        expect(helpPart1).toContain(fragment);
      }
      for (const fragment of expectedHelpPart2Fragments[language]) {
        expect(helpPart2).toContain(fragment);
      }
      for (const fragment of expectedHelpPart3Fragments[language]) {
        expect(helpPart2).toContain(fragment);
      }
      expect(helpPart1).toContain('<pre>');
      expect(helpPart1).toContain('<p>');
      expect(helpPart1).toContain('<ul><li>');
      expect(helpPart1).toContain('</h2>\n<p>');
      expect(helpPart1).toContain('</h3>\n<p>');
      expect(helpPart1).not.toContain('<br><br>');
      expect(helpPart2).toContain('<ul><li>');
      expect(helpPart2).toContain('<hr/>');
      expect(helpPart2).not.toContain('<br><br>');
      expect(Buffer.byteLength(helpPart1, 'utf8')).toBeLessThanOrEqual(32768);
      expect(Buffer.byteLength(helpPart2, 'utf8')).toBeLessThanOrEqual(32768);
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help1');
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help2');
      expect(mockCtx.t).toHaveBeenCalledWith('templates.help3');
    });
  });
});
