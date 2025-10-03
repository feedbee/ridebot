/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';

describe('index.js', () => {
  let mockBot;
  let mockMemoryStorage;
  let mockMongoDBStorage;
  let mockConfig;
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;
  let main;

  beforeEach(async () => {
    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    // Create mock storage instances
    mockMemoryStorage = {
      name: 'MemoryStorage'
    };
    mockMongoDBStorage = {
      name: 'MongoDBStorage'
    };

    // Create mock Bot instance
    mockBot = {
      start: jest.fn().mockResolvedValue(undefined)
    };

    // Mock the config module
    jest.unstable_mockModule('../config.js', () => ({
      config: {
        isDev: true,
        bot: { token: 'test-token' }
      }
    }));

    // Mock the Bot class
    jest.unstable_mockModule('../core/Bot.js', () => ({
      Bot: jest.fn().mockImplementation(() => mockBot)
    }));

    // Mock MemoryStorage
    jest.unstable_mockModule('../storage/memory.js', () => ({
      MemoryStorage: jest.fn().mockImplementation(() => mockMemoryStorage)
    }));

    // Mock MongoDBStorage
    jest.unstable_mockModule('../storage/mongodb.js', () => ({
      MongoDBStorage: jest.fn().mockImplementation(() => mockMongoDBStorage)
    }));
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('Storage Selection', () => {
    it('should use MemoryStorage in development mode', async () => {
      // Setup - config.isDev = true
      const { config } = await import('../config.js');
      config.isDev = true;
      
      const { Bot } = await import('../core/Bot.js');
      const { MemoryStorage } = await import('../storage/memory.js');
      const { MongoDBStorage } = await import('../storage/mongodb.js');

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify
      expect(MemoryStorage).toHaveBeenCalledTimes(1);
      expect(MongoDBStorage).not.toHaveBeenCalled();
      expect(Bot).toHaveBeenCalledWith(mockMemoryStorage);
    });

    it('should use MongoDBStorage in production mode', async () => {
      // Setup - config.isDev = false
      const { config } = await import('../config.js');
      config.isDev = false;
      
      const { Bot } = await import('../core/Bot.js');
      const { MemoryStorage } = await import('../storage/memory.js');
      const { MongoDBStorage } = await import('../storage/mongodb.js');

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify
      expect(MongoDBStorage).toHaveBeenCalledTimes(1);
      expect(MemoryStorage).not.toHaveBeenCalled();
      expect(Bot).toHaveBeenCalledWith(mockMongoDBStorage);
    });
  });

  describe('Bot Initialization', () => {
    it('should create Bot instance with correct storage', async () => {
      // Setup
      const { config } = await import('../config.js');
      config.isDev = true;
      
      const { Bot } = await import('../core/Bot.js');

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify
      expect(Bot).toHaveBeenCalledWith(mockMemoryStorage);
      expect(Bot).toHaveBeenCalledTimes(1);
    });

    it('should call bot.start()', async () => {
      // Setup
      const { config } = await import('../config.js');
      config.isDev = true;

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify
      expect(mockBot.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('Success Logging', () => {
    it('should log success message with "development" in dev mode', async () => {
      // Setup
      const { config } = await import('../config.js');
      config.isDev = true;

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify
      expect(consoleLogSpy).toHaveBeenCalledWith('Bot started in development mode');
    });

    it('should log success message with "production" in production mode', async () => {
      // Setup
      const { config } = await import('../config.js');
      config.isDev = false;

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify
      expect(consoleLogSpy).toHaveBeenCalledWith('Bot started in production mode');
    });
  });

  describe('Error Handling', () => {
    it('should handle bot.start() failure and log error', async () => {
      // Setup
      const startError = new Error('Failed to connect to Telegram');
      mockBot.start.mockRejectedValue(startError);

      const { config } = await import('../config.js');
      config.isDev = true;

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify error was logged with proper context
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to start bot:',
        startError
      );
      
      // Verify the error message contains expected details
      expect(consoleErrorSpy.mock.calls[0][1].message).toBe('Failed to connect to Telegram');
    });

    it('should call process.exit(1) on bot.start() failure', async () => {
      // Setup
      const startError = new Error('Failed to connect to Telegram');
      mockBot.start.mockRejectedValue(startError);

      const { config } = await import('../config.js');
      config.isDev = true;

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to start bot:',
        expect.objectContaining({ message: 'Failed to connect to Telegram' })
      );
      
      // Verify process exited with error code
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(processExitSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Main Function Execution', () => {
    it('should execute main function automatically on module load', async () => {
      // Setup
      const { config } = await import('../config.js');
      config.isDev = true;
      
      const { Bot } = await import('../core/Bot.js');

      // Execute
      const { default: indexModule } = await import('../index.js');

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify that everything was called (proves main() was executed)
      expect(Bot).toHaveBeenCalled();
      expect(mockBot.start).toHaveBeenCalled();
    });
  });
});

