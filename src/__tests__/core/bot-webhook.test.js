import request from 'supertest';
import { Bot as GrammyBot } from 'grammy';
import { Bot } from '../../core/Bot.js';
import { config as appConfig } from '../../config.js';
import { MemoryStorage } from '../../storage/MemoryStorage.js';

// Mock GrammyBot methods
const mockApi = {
  setWebhook: jest.fn().mockResolvedValue(true),
  deleteWebhook: jest.fn().mockResolvedValue(true),
  getMe: jest.fn().mockResolvedValue({ username: 'testbot' }),
  setMyCommands: jest.fn().mockResolvedValue(true),
};
const mockGrammyBotStart = jest.fn();
const mockGrammyBotHandleUpdate = jest.fn();

jest.mock('grammy', () => {
  const actualGrammy = jest.requireActual('grammy');
  return {
    ...actualGrammy,
    Bot: jest.fn().mockImplementation((token) => ({
      api: mockApi,
      start: mockGrammyBotStart,
      handleUpdate: mockGrammyBotHandleUpdate,
      use: jest.fn(),
      command: jest.fn(),
      callbackQuery: jest.fn(),
      on: jest.fn(),
    })),
  };
});

describe('Bot Webhook Functionality', () => {
  let botInstance;
  let server; // To hold the Express server instance for supertest

  const originalUseWebhook = appConfig.bot.useWebhook;
  const originalWebhookPort = appConfig.bot.webhookPort;
  const originalWebhookPath = appConfig.bot.webhookPath;

  beforeAll(async () => {
    // Override config for testing webhook mode
    appConfig.bot.useWebhook = true;
    appConfig.bot.webhookPort = 0; // Use 0 to let the OS pick an available port
    appConfig.bot.webhookPath = '/test-webhook';

    const storage = new MemoryStorage();
    botInstance = new Bot(storage);

    // The Bot's start method now internally creates and starts the Express server.
    // We need to get a reference to this server.
    // Temporarily spy on app.listen to capture the server instance
    const express = require('express');
    const actualListen = express.application.listen;
    const listenSpy = jest.spyOn(express.application, 'listen');
    listenSpy.mockImplementation(function (...args) {
      const httpServer = actualListen.apply(this, args);
      server = httpServer; // Capture the server
      return httpServer;
    });

    await botInstance.start(); // This will now set up and start the webhook server

    listenSpy.mockRestore(); // Restore original listen

    if (!server) {
      // Fallback or error if server wasn't captured
      // This might happen if the Bot's start method changes significantly.
      // For now, we'll try to access the server via the bot instance if possible,
      // or create a new one for testing if the bot doesn't expose it.
      // This part is tricky as the Express app is encapsulated.
      // The ideal scenario is that botInstance.start() returns the server or app,
      // or appConfig allows injecting an app.
      // For now, we rely on the spy or assume a fixed port if spy fails.
      console.warn("Server instance not captured via spy. Tests might be unreliable if port is not fixed or accessible.");
      // If server is still not defined, we might need to reconsider how to test this.
      // One option is to have Bot#start return the app or server.
    }
  });

  afterAll(async () => {
    // Restore original config
    appConfig.bot.useWebhook = originalUseWebhook;
    appConfig.bot.webhookPort = originalWebhookPort;
    appConfig.bot.webhookPath = originalWebhookPath;

    if (server && server.listening) {
      await new Promise(resolve => server.close(resolve));
    }
    // Reset mocks
    mockApi.setWebhook.mockClear();
    mockGrammyBotHandleUpdate.mockClear();
    GrammyBot.mockClear();
  });

  test('should start the webhook server when useWebhook is true', async () => {
    expect(mockApi.setWebhook).toHaveBeenCalled();
    // The webhook URL should be constructed with the test config
    const expectedWebhookUrl = `${appConfig.bot.webhookDomain}${appConfig.bot.webhookPath}`;
    expect(mockApi.setWebhook).toHaveBeenCalledWith(expectedWebhookUrl);
    expect(server).toBeDefined();
    expect(server.listening).toBe(true);
  });

  test('should call handleUpdate when a valid update is sent to the webhook URL', async () => {
    if (!server) {
      console.warn("Skipping test: server instance not available.");
      return;
    }
    const mockUpdate = { update_id: 1, message: { text: 'hello' } };

    const response = await request(server)
      .post(appConfig.bot.webhookPath)
      .send(mockUpdate);

    expect(response.status).toBe(200);
    // Check if the underlying GrammyBot's handleUpdate was called
    // This is a bit indirect. Ideally, we'd check botInstance.telegram.handleUpdate
    // but that's an instance of TelegramClient, not the GrammyBot mock.
    // The current mock structure calls the mocked GrammyBot's handleUpdate.
    expect(mockGrammyBotHandleUpdate).toHaveBeenCalledWith(mockUpdate);
  });

  test('should not start polling when useWebhook is true', () => {
    expect(mockGrammyBotStart).not.toHaveBeenCalled();
  });

  test('should correctly configure webhook path, even if default', async () => {
    // Test with default path
    appConfig.bot.webhookPath = '/'; // Temporarily change for this test
    const storage = new MemoryStorage();
    const tempBot = new Bot(storage);

    let tempServer;
    const express = require('express');
    const actualListen = express.application.listen;
    const listenSpy = jest.spyOn(express.application, 'listen');
    listenSpy.mockImplementation(function (...args) {
      const httpServer = actualListen.apply(this, args);
      tempServer = httpServer;
      return httpServer;
    });

    await tempBot.start();
    listenSpy.mockRestore();

    const mockUpdate = { update_id: 2, message: { text: 'another hello' } };
    const response = await request(tempServer)
      .post('/') // Use the root path
      .send(mockUpdate);

    expect(response.status).toBe(200);
    expect(mockGrammyBotHandleUpdate).toHaveBeenCalledWith(mockUpdate);

    if (tempServer && tempServer.listening) {
      await new Promise(resolve => tempServer.close(resolve));
    }
    appConfig.bot.webhookPath = '/test-webhook'; // Reset to original test path
  });
});
