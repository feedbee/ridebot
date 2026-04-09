/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

const mockBotUse = jest.fn();
const mockBotCommand = jest.fn();
const mockBotCallbackQuery = jest.fn();
const mockBotOn = jest.fn();
const mockBotStart = jest.fn();
const mockApi = {
  setWebhook: jest.fn(),
  deleteWebhook: jest.fn(),
  getMe: jest.fn(),
  setMyCommands: jest.fn(),
};
const mockWebhookCallback = jest.fn(() => 'webhook-middleware');
const mockGrammyBot = jest.fn().mockImplementation(() => ({
  use: mockBotUse,
  command: mockBotCommand,
  callbackQuery: mockBotCallbackQuery,
  on: mockBotOn,
  start: mockBotStart,
  api: mockApi,
}));

await jest.unstable_mockModule('grammy', async () => ({
  Bot: mockGrammyBot,
  webhookCallback: mockWebhookCallback,
}));

const { TelegramGateway } = await import('../../telegram/TelegramGateway.js');

describe('TelegramGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('constructs an underlying grammy bot', () => {
    const gateway = new TelegramGateway('secret-token');

    expect(mockGrammyBot).toHaveBeenCalledWith('secret-token');
    expect(gateway.api).toBe(mockApi);
  });

  it('delegates registration methods to grammy', () => {
    const gateway = new TelegramGateway('secret-token');
    const handler = jest.fn();
    const middleware = jest.fn();

    gateway.use(middleware);
    gateway.command('start', handler);
    gateway.callbackQuery(/^join:/, handler);
    gateway.on('message:text', handler);

    expect(mockBotUse).toHaveBeenCalledWith(middleware);
    expect(mockBotCommand).toHaveBeenCalledWith('start', handler);
    expect(mockBotCallbackQuery).toHaveBeenCalledWith(/^join:/, handler);
    expect(mockBotOn).toHaveBeenCalledWith('message:text', handler);
  });

  it('creates express webhook middleware through grammy', () => {
    const gateway = new TelegramGateway('secret-token');

    const middleware = gateway.createWebhookMiddleware();

    expect(mockWebhookCallback).toHaveBeenCalledWith(expect.any(Object), 'express');
    expect(middleware).toBe('webhook-middleware');
  });

  it('starts polling through grammy', () => {
    const gateway = new TelegramGateway('secret-token');

    gateway.startPolling();

    expect(mockBotStart).toHaveBeenCalled();
  });
});
