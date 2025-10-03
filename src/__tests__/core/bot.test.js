/**
 * @jest-environment node
 * 
 * Tests for Bot.js core functionality
 */

import { jest } from '@jest/globals';
import { MemoryStorage } from '../../storage/memory.js';

// Mock Grammy before importing Bot
const mockBotUse = jest.fn();
const mockBotCommand = jest.fn();
const mockBotCallbackQuery = jest.fn();
const mockBotOn = jest.fn();
const mockBotStart = jest.fn();
const mockApiSetMyCommands = jest.fn().mockResolvedValue(true);
const mockApiGetMe = jest.fn().mockResolvedValue({ username: 'testbot' });
const mockApiDeleteWebhook = jest.fn().mockResolvedValue(true);

await jest.unstable_mockModule('grammy', () => ({
  Bot: jest.fn().mockImplementation(() => ({
    use: mockBotUse,
    command: mockBotCommand,
    callbackQuery: mockBotCallbackQuery,
    on: mockBotOn,
    start: mockBotStart,
    api: {
      setMyCommands: mockApiSetMyCommands,
      getMe: mockApiGetMe,
      deleteWebhook: mockApiDeleteWebhook
    }
  })),
  webhookCallback: jest.fn(),
  InlineKeyboard: class InlineKeyboard {}
}));

const { Bot } = await import('../../core/Bot.js');

describe('Bot', () => {
  let bot;
  let storage;

  beforeEach(() => {
    storage = new MemoryStorage();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize all services and handlers', () => {
      bot = new Bot(storage);

      expect(bot.wizard).toBeDefined();
      expect(bot.bot).toBeDefined();
      expect(bot.helpHandler).toBeDefined();
      expect(bot.startHandler).toBeDefined();
      expect(bot.newRideHandler).toBeDefined();
      expect(bot.updateRideHandler).toBeDefined();
      expect(bot.cancelRideHandler).toBeDefined();
      expect(bot.deleteRideHandler).toBeDefined();
      expect(bot.listRidesHandler).toBeDefined();
      expect(bot.duplicateRideHandler).toBeDefined();
      expect(bot.postRideHandler).toBeDefined();
      expect(bot.resumeRideHandler).toBeDefined();
      expect(bot.participationHandlers).toBeDefined();
    });

    it('should call setupHandlers during construction', () => {
      bot = new Bot(storage);

      // Verify middleware was registered
      expect(mockBotUse).toHaveBeenCalled();
    });
  });

  describe('setupHandlers', () => {
    beforeEach(() => {
      bot = new Bot(storage);
    });

    it('should register callback query handlers', () => {
      expect(mockBotCallbackQuery).toHaveBeenCalledWith(
        /^join:(.+)$/,
        expect.any(Function)
      );
      expect(mockBotCallbackQuery).toHaveBeenCalledWith(
        /^leave:(.+)$/,
        expect.any(Function)
      );
      expect(mockBotCallbackQuery).toHaveBeenCalledWith(
        /^delete:(\w+):(\w+)$/,
        expect.any(Function)
      );
      expect(mockBotCallbackQuery).toHaveBeenCalledWith(
        /^list:(\d+)$/,
        expect.any(Function)
      );
      expect(mockBotCallbackQuery).toHaveBeenCalledWith(
        /^wizard:(\w+)(?::(.*))?$/,
        expect.any(Function)
      );
    });

    it('should register wizard input handler', () => {
      expect(mockBotOn).toHaveBeenCalledWith(
        'message:text',
        expect.any(Function)
      );
    });
  });

  describe('setupCommandHandlers', () => {
    beforeEach(() => {
      bot = new Bot(storage);
    });

    it('should register all command handlers', () => {
      expect(mockBotCommand).toHaveBeenCalledWith('start', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('help', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('newride', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('updateride', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('cancelride', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('resumeride', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('deleteride', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('listrides', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('dupride', expect.any(Function));
      expect(mockBotCommand).toHaveBeenCalledWith('postride', expect.any(Function));
    });

    it('should handle postride in group chat without parameters', async () => {
      bot = new Bot(storage);

      // Find the postride command handler
      const postrideCall = mockBotCommand.mock.calls.find(call => call[0] === 'postride');
      const postrideHandler = postrideCall[1];

      // Create mock context for group chat without match
      const mockCtx = {
        chat: { type: 'group' },
        match: null,
        reply: jest.fn().mockResolvedValue({}),
        api: {
          getMe: jest.fn().mockResolvedValue({ username: 'testbot' })
        }
      };

      await postrideHandler(mockCtx);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('How to post a ride in this chat'),
        { parse_mode: 'HTML' }
      );
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('@testbot'),
        { parse_mode: 'HTML' }
      );
    });

    it('should process postride normally in private chat', async () => {
      bot = new Bot(storage);

      // Verify the post ride handler is registered for all chats
      const postrideCall = mockBotCommand.mock.calls.find(call => call[0] === 'postride');
      expect(postrideCall).toBeDefined();
    });

    it('should process postride normally in group chat with parameters', async () => {
      bot = new Bot(storage);

      // Verify postride command is registered (will work in any chat type)
      const postrideCall = mockBotCommand.mock.calls.find(call => call[0] === 'postride');
      expect(postrideCall).toBeDefined();
      expect(postrideCall[0]).toBe('postride');
    });

    it('should only allow private chat commands in private chats', async () => {
      bot = new Bot(storage);

      // Test that commands return false/undefined in group chats
      const startCall = mockBotCommand.mock.calls.find(call => call[0] === 'start');
      const startHandler = startCall[1];

      const groupCtx = { chat: { type: 'group' } };
      const result = startHandler(groupCtx);

      expect(result).toBeFalsy();
    });

    it('should allow private chat commands in private chats', async () => {
      bot = new Bot(storage);

      // Test that commands are registered for private chats
      const startCall = mockBotCommand.mock.calls.find(call => call[0] === 'start');
      expect(startCall).toBeDefined();
      expect(startCall[0]).toBe('start');
    });
  });

  describe('setupBotCommands', () => {
    beforeEach(() => {
      bot = new Bot(storage);
      jest.clearAllMocks();
    });

    it('should set up commands for private chats', async () => {
      await bot.setupBotCommands();

      expect(mockApiSetMyCommands).toHaveBeenCalledWith(
        expect.arrayContaining([
          { command: 'start', description: expect.any(String) },
          { command: 'help', description: expect.any(String) },
          { command: 'newride', description: expect.any(String) },
          { command: 'postride', description: expect.any(String) }
        ]),
        { scope: { type: 'all_private_chats' } }
      );
    });

    it('should set up limited commands for group chats', async () => {
      await bot.setupBotCommands();

      expect(mockApiSetMyCommands).toHaveBeenCalledWith(
        [{ command: 'postride', description: expect.any(String) }],
        { scope: { type: 'all_group_chats' } }
      );
    });

    it('should handle errors when setting up commands', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('API error');
      mockApiSetMyCommands.mockRejectedValueOnce(error);

      await bot.setupBotCommands();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error setting up bot commands:',
        error
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('start', () => {
    let originalConfig;

    beforeEach(async () => {
      const { config } = await import('../../config.js');
      originalConfig = { ...config.bot };
      bot = new Bot(storage);
      jest.clearAllMocks();
    });

    afterEach(async () => {
      const { config } = await import('../../config.js');
      config.bot = originalConfig;
    });

    it('should start in polling mode when webhook is disabled', async () => {
      const { config } = await import('../../config.js');
      config.bot.useWebhook = false;

      await bot.start();

      expect(mockApiDeleteWebhook).toHaveBeenCalled();
      expect(mockBotStart).toHaveBeenCalled();
    });

    it('should call setupBotCommands before starting', async () => {
      const { config } = await import('../../config.js');
      config.bot.useWebhook = false;

      const setupSpy = jest.spyOn(bot, 'setupBotCommands').mockResolvedValue();

      await bot.start();

      expect(setupSpy).toHaveBeenCalled();
      setupSpy.mockRestore();
    });
  });
});

