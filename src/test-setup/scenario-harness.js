import { jest } from '@jest/globals';

class MockInlineKeyboard {
  constructor() {
    this.inline_keyboard = [[]];
  }

  text(label, callbackData) {
    const lastRow = this.inline_keyboard[this.inline_keyboard.length - 1];
    lastRow.push({ text: label, callback_data: callbackData });
    return this;
  }

  row() {
    if (this.inline_keyboard[this.inline_keyboard.length - 1].length > 0) {
      this.inline_keyboard.push([]);
    }
    return this;
  }
}

function createMockGrammyRuntime() {
  const middlewares = [];
  const commands = new Map();
  const callbacks = [];
  const messageTextHandlers = [];

  const botApi = {
    setMyCommands: jest.fn().mockResolvedValue(true),
    getMe: jest.fn().mockResolvedValue({ username: 'testbot' }),
    deleteWebhook: jest.fn().mockResolvedValue(true),
    setWebhook: jest.fn().mockResolvedValue(true),
  };

  const botInstance = {
    api: botApi,
    start: jest.fn(),
    use: jest.fn((middleware) => {
      middlewares.push(middleware);
      return botInstance;
    }),
    command: jest.fn((command, handler) => {
      commands.set(command, handler);
      return botInstance;
    }),
    callbackQuery: jest.fn((pattern, handler) => {
      callbacks.push({ pattern, handler });
      return botInstance;
    }),
    on: jest.fn((eventName, handler) => {
      if (eventName === 'message:text') {
        messageTextHandlers.push(handler);
      }
      return botInstance;
    }),
  };

  return {
    middlewares,
    commands,
    callbacks,
    messageTextHandlers,
    botApi,
    botInstance,
  };
}

function cloneRegex(regex) {
  return new RegExp(regex.source, regex.flags);
}

export async function createScenarioHarness() {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || 'test-token';
  jest.resetModules();

  const runtime = createMockGrammyRuntime();

  await jest.unstable_mockModule('grammy', async () => ({
    Bot: jest.fn().mockImplementation(() => runtime.botInstance),
    InlineKeyboard: MockInlineKeyboard,
    webhookCallback: jest.fn(),
  }));

  const { Bot } = await import('../core/Bot.js');
  const { MemoryStorage } = await import('../storage/memory.js');

  const storage = new MemoryStorage();
  const bot = new Bot(storage);

  const outbox = {
    replies: [],
    edits: [],
    callbackAnswers: [],
    deletes: [],
  };

  let nextMessageId = 1000;

  const createCtx = ({
    chat = { id: 100, type: 'private' },
    from = { id: 200, first_name: 'Test', last_name: 'User', username: 'testuser' },
    text = '',
    callbackData = null,
    message = null,
  } = {}) => {
    const baseMessage = message || {
      message_id: nextMessageId++,
      text,
      chat,
      from,
    };

    const ctx = {
      chat,
      from,
      message: callbackData ? undefined : baseMessage,
      callbackQuery: callbackData ? {
        id: `cb-${nextMessageId++}`,
        data: callbackData,
        from,
        message: message || {
          message_id: nextMessageId++,
          text: '',
          chat,
          from,
        },
      } : undefined,
      match: null,
      reply: jest.fn(async (replyText, options = {}) => {
        const sentMessage = {
          message_id: nextMessageId++,
          text: replyText,
          chat,
          from: { id: 0, is_bot: true, username: 'testbot' },
          options,
        };
        outbox.replies.push({
          chatId: chat.id,
          messageId: sentMessage.message_id,
          text: replyText,
          options,
        });
        return sentMessage;
      }),
      replyWithHTML: jest.fn(async (replyText, options = {}) => ctx.reply(replyText, { ...options, parse_mode: 'HTML' })),
      editMessageText: jest.fn(async (replyText, options = {}) => {
        outbox.edits.push({
          via: 'ctx.editMessageText',
          chatId: chat.id,
          messageId: ctx.callbackQuery?.message?.message_id,
          text: replyText,
          options,
        });
        return {};
      }),
      editMessageReplyMarkup: jest.fn().mockResolvedValue({}),
      answerCallbackQuery: jest.fn(async (textArg) => {
        outbox.callbackAnswers.push({ text: textArg ?? null });
        return {};
      }),
      api: {
        sendMessage: jest.fn(async (chatId, replyText, options = {}) => {
          const sentMessage = {
            message_id: nextMessageId++,
            text: replyText,
            chat: { id: chatId },
            options,
          };
          outbox.replies.push({
            chatId,
            messageId: sentMessage.message_id,
            text: replyText,
            options,
          });
          return sentMessage;
        }),
        editMessageText: jest.fn(async (chatId, messageId, replyText, options = {}) => {
          outbox.edits.push({
            via: 'api.editMessageText',
            chatId,
            messageId,
            text: replyText,
            options,
          });
          return {};
        }),
        editMessageReplyMarkup: jest.fn().mockResolvedValue({}),
        deleteMessage: jest.fn(async (chatId, messageId) => {
          outbox.deletes.push({ chatId, messageId });
          return {};
        }),
      },
    };

    return ctx;
  };

  const runWithMiddlewares = async (ctx, terminalHandler) => {
    let index = -1;
    const dispatch = async (cursor) => {
      if (cursor <= index) {
        throw new Error('Middleware chain invoked next() multiple times');
      }
      index = cursor;

      if (cursor === runtime.middlewares.length) {
        return terminalHandler();
      }

      const middleware = runtime.middlewares[cursor];
      return middleware(ctx, () => dispatch(cursor + 1));
    };

    return dispatch(0);
  };

  const dispatchMessage = async ({ text, chat, from, messageThreadId } = {}) => {
    const effectiveChat = chat || { id: 100, type: 'private' };
    const effectiveFrom = from || { id: 200, first_name: 'Test', last_name: 'User', username: 'testuser' };
    const message = {
      message_id: nextMessageId++,
      text,
      chat: effectiveChat,
      from: effectiveFrom,
    };

    if (messageThreadId) {
      message.message_thread_id = messageThreadId;
    }

    const ctx = createCtx({
      chat: effectiveChat,
      from: effectiveFrom,
      text,
      message,
    });

    const commandMatch = text.match(/^\/(\w+)(?:@\w+)?/);
    const commandName = commandMatch?.[1];

    await runWithMiddlewares(ctx, async () => {
      if (commandName && runtime.commands.has(commandName)) {
        await runtime.commands.get(commandName)(ctx);
      }

      for (const handler of runtime.messageTextHandlers) {
        await handler(ctx);
      }
    });

    return ctx;
  };

  const dispatchCallback = async ({ data, chat, from, message } = {}) => {
    const effectiveChat = chat || { id: 100, type: 'private' };
    const effectiveFrom = from || { id: 200, first_name: 'Test', last_name: 'User', username: 'testuser' };
    const sourceMessage = message || {
      message_id: nextMessageId++,
      text: '',
      chat: effectiveChat,
      from: { id: 0, is_bot: true, username: 'testbot' },
    };

    const ctx = createCtx({
      chat: effectiveChat,
      from: effectiveFrom,
      callbackData: data,
      message: sourceMessage,
    });

    const callbackRegistration = runtime.callbacks.find(({ pattern }) => cloneRegex(pattern).test(data));
    if (!callbackRegistration) {
      throw new Error(`No callback handler registered for ${data}`);
    }

    ctx.match = data.match(cloneRegex(callbackRegistration.pattern));

    await runWithMiddlewares(ctx, async () => {
      await callbackRegistration.handler(ctx);
    });

    return ctx;
  };

  const listRides = () => Array.from(storage.rides.values());
  const getRide = (rideId) => storage.rides.get(rideId) || null;

  return {
    bot,
    storage,
    outbox,
    runtime,
    dispatchMessage,
    dispatchCallback,
    listRides,
    getRide,
  };
}
