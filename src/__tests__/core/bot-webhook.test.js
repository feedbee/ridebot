import { jest } from '@jest/globals';

const mockApi = {
  setWebhook: jest.fn().mockResolvedValue(true),
  deleteWebhook: jest.fn().mockResolvedValue(true),
  getMe: jest.fn().mockResolvedValue({ username: 'testbot' }),
  setMyCommands: jest.fn().mockResolvedValue(true),
};
const mockGatewayUse = jest.fn();
const mockGatewayCommand = jest.fn();
const mockGatewayCallbackQuery = jest.fn();
const mockGatewayOn = jest.fn();
const mockGatewayStartPolling = jest.fn();
const mockGrammyBotHandleUpdate = jest.fn();
const mockWebhookMiddleware = jest.fn((req, res) => {
  try {
    mockGrammyBotHandleUpdate(req.body);
    res.sendStatus(200);
  } catch (e) {
    res.sendStatus(500);
  }
});
const mockCreateWebhookMiddleware = jest.fn(() => mockWebhookMiddleware);

const mockServer = {
  listening: true,
  close: jest.fn((cb) => cb && cb()),
};

const mockExpressApp = {
  use: jest.fn(),
  listen: jest.fn((port, cb) => {
    if (cb) cb();
    return mockServer;
  }),
};

const mockExpressJson = jest.fn(() => 'json-middleware');
const mockExpressFactory = jest.fn(() => mockExpressApp);
mockExpressFactory.json = mockExpressJson;

await jest.unstable_mockModule('../../telegram/TelegramGateway.js', async () => ({
  TelegramGateway: jest.fn().mockImplementation(() => ({
    api: mockApi,
    use: mockGatewayUse,
    command: mockGatewayCommand,
    callbackQuery: mockGatewayCallbackQuery,
    on: mockGatewayOn,
    startPolling: mockGatewayStartPolling,
    createWebhookMiddleware: mockCreateWebhookMiddleware,
  })),
}));

await jest.unstable_mockModule('express', async () => ({
  default: mockExpressFactory,
}));

const { Bot } = await import('../../core/Bot.js');
const { config: appConfig } = await import('../../config.js');
const { MemoryStorage } = await import('../../storage/memory.js');

describe('Bot Webhook Functionality', () => {
  let botInstance;

  const originalUseWebhook = appConfig.bot.useWebhook;
  const originalWebhookPort = appConfig.bot.webhookPort;
  const originalWebhookPath = appConfig.bot.webhookPath;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer.listening = true;
    appConfig.bot.useWebhook = true;
    appConfig.bot.webhookPort = 8081;
    appConfig.bot.webhookPath = '/test-webhook';

    const storage = new MemoryStorage();
    botInstance = new Bot(storage);
  });

  afterAll(async () => {
    appConfig.bot.useWebhook = originalUseWebhook;
    appConfig.bot.webhookPort = originalWebhookPort;
    appConfig.bot.webhookPath = originalWebhookPath;
  });

  test('should start webhook mode and set webhook URL', async () => {
    await botInstance.start();
    await Promise.resolve();

    const expectedWebhookUrl = `${appConfig.bot.webhookDomain}${appConfig.bot.webhookPath}`;
    expect(mockExpressFactory).toHaveBeenCalled();
    expect(mockExpressJson).toHaveBeenCalled();
    expect(mockExpressApp.listen).toHaveBeenCalledWith(appConfig.bot.webhookPort, expect.any(Function));
    expect(mockApi.setWebhook).toHaveBeenCalledWith(expectedWebhookUrl);
    expect(mockGatewayStartPolling).not.toHaveBeenCalled();
  });

  test('should register webhook handler on configured path', async () => {
    await botInstance.start();
    await Promise.resolve();

    expect(mockCreateWebhookMiddleware).toHaveBeenCalled();
    expect(mockExpressApp.use).toHaveBeenCalledWith('/test-webhook', mockWebhookMiddleware);
  });

  test('should pass updates from webhook middleware to bot handler', async () => {
    await botInstance.start();
    await Promise.resolve();

    const webhookUseCall = mockExpressApp.use.mock.calls.find((call) => call[0] === '/test-webhook');
    expect(webhookUseCall).toBeDefined();

    const webhookHandler = webhookUseCall[1];
    const req = { body: { update_id: 1, message: { text: 'hello' } } };
    const res = { sendStatus: jest.fn() };

    webhookHandler(req, res);

    expect(mockGrammyBotHandleUpdate).toHaveBeenCalledWith(req.body);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  test('should support root webhook path', async () => {
    appConfig.bot.webhookPath = '/';
    const storage = new MemoryStorage();
    const tempBot = new Bot(storage);

    await tempBot.start();
    await Promise.resolve();

    expect(mockExpressApp.use).toHaveBeenCalledWith('/', mockWebhookMiddleware);
    const expectedWebhookUrl = `${appConfig.bot.webhookDomain}/`;
    expect(mockApi.setWebhook).toHaveBeenCalledWith(expectedWebhookUrl);
  });
});
